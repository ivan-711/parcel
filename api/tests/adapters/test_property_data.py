from collections.abc import Callable
from datetime import date
from typing import Any

import httpx
import pytest

from parcel.adapters.property_data import LiveData, Place, ProviderError

PLACE = Place(
    line1="1420 N 14th St",
    city="Sheboygan",
    state="WI",
    zip="53081",
    state_fips="55",
    county_fips="117",
)


def live(route: Callable[[httpx.Request], httpx.Response]) -> LiveData:
    client = httpx.AsyncClient(transport=httpx.MockTransport(route))
    return LiveData(client, rentcast_key="rk", geoapify_key="gk", fred_key="fk", hud_token="ht")


def answer(body: Any, status: int = 200) -> Callable[[httpx.Request], httpx.Response]:
    return lambda _: httpx.Response(status, json=body)


async def test_rentcast_rent_estimate_parsing() -> None:
    seen: list[httpx.Request] = []

    def route(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            json={
                "rent": 1620,
                "rentRangeLow": 1550,
                "rentRangeHigh": 1690,
                "subjectProperty": {
                    "addressLine1": "1420 N 14th St",
                    "city": "Sheboygan",
                    "state": "WI",
                    "zipCode": "53081",
                    "stateFips": "55",
                    "countyFips": "117",
                    "county": "Sheboygan",
                    "bedrooms": 3,
                    "bathrooms": 2,
                    "squareFootage": 1878,
                    "yearBuilt": 1973,
                    "lastSaleDate": "2017-10-19T00:00:00.000Z",
                    "lastSalePrice": 185000,
                },
                "comparables": [
                    {
                        "formattedAddress": "1 A St",
                        "price": 1600,
                        "bedrooms": 3,
                        "distance": 0.4,
                        "daysOld": 20,
                    },
                    {"formattedAddress": "no price"},
                ],
            },
        )

    est = await live(route).rent_estimate(PLACE)
    assert (est.value, est.low, est.high) == (1620, 1550, 1690)
    assert est.facts.year_built == 1973
    assert est.facts.last_sale_date == "2017-10-19"
    assert [c.address for c in est.comparables] == ["1 A St"]
    assert seen[0].headers["X-Api-Key"] == "rk"
    assert seen[0].url.params["address"] == PLACE.one_line


async def test_rentcast_without_an_estimate_is_an_error() -> None:
    with pytest.raises(ProviderError, match="no estimate"):
        await live(answer({"price": None})).value_estimate(PLACE)


@pytest.mark.parametrize("status", [401, 429, 500])
async def test_http_errors_become_provider_errors(status: int) -> None:
    with pytest.raises(ProviderError, match=str(status)):
        await live(answer({}, status)).value_estimate(PLACE)


async def test_network_errors_become_provider_errors() -> None:
    def route(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route", request=request)

    with pytest.raises(ProviderError, match="unreachable"):
        await live(route).mortgage_rate()


async def test_census_geocoder() -> None:
    body = {
        "result": {
            "addressMatches": [
                {
                    "matchedAddress": "1420 N 14TH ST, SHEBOYGAN, WI, 53081",
                    "coordinates": {"x": -87.72, "y": 43.76},
                    "addressComponents": {"city": "SHEBOYGAN", "state": "WI", "zip": "53081"},
                    "geographies": {
                        "Counties": [{"STATE": "55", "COUNTY": "117", "NAME": "Sheboygan County"}]
                    },
                }
            ]
        }
    }
    place = await live(answer(body)).geocode("1420 n 14th st sheboygan")
    assert place == Place(
        line1="1420 N 14Th St",
        city="Sheboygan",
        state="WI",
        zip="53081",
        latitude=43.76,
        longitude=-87.72,
        state_fips="55",
        county_fips="117",
        county="Sheboygan County",
    )
    assert await live(answer({"result": {"addressMatches": []}})).geocode("x") is None


async def test_acs_tax_rate() -> None:
    body = [["B25103_001E", "B25077_001E", "state", "county"], ["3615", "208100", "55", "117"]]
    rate = await live(answer(body)).county_tax_rate("55", "117")
    assert rate == pytest.approx((3615 / 208100, 2023))
    assert await live(answer([["h"]])).county_tax_rate("55", "117") is None
    assert await live(answer([["h"], ["-666666666", "0"]])).county_tax_rate("55", "117") is None


async def test_hud_county_and_small_area_rents() -> None:
    county = {
        "data": {
            "basicdata": {
                "Efficiency": "758",
                "One-Bedroom": "769",
                "Two-Bedroom": "948",
                "Three-Bedroom": "1186",
                "Four-Bedroom": "1386",
                "year": "2026",
            }
        }
    }
    assert await live(answer(county)).fair_market_rent(PLACE, 3) == (1186, 2026)
    assert await live(answer(county)).fair_market_rent(PLACE, 7) == (1386, 2026)
    by_zip = {
        "data": {
            "basicdata": [
                {"zip_code": "53083", "Two-Bedroom": "1000", "year": "2026"},
                {"zip_code": "53081", "Two-Bedroom": "1100", "year": "2026"},
            ]
        }
    }
    assert await live(answer(by_zip)).fair_market_rent(PLACE, 2) == (1100, 2026)
    assert await live(answer({"data": {}})).fair_market_rent(PLACE, 2) is None
    no_fips = Place(line1="x", city="y", state="WI", zip="1")
    assert await live(answer(county)).fair_market_rent(no_fips, 2) is None


async def test_fred_skips_missing_observations() -> None:
    body = {
        "observations": [
            {"date": "2026-10-08", "value": "."},
            {"date": "2026-10-01", "value": "6.31"},
        ]
    }
    found = await live(answer(body)).mortgage_rate()
    assert found is not None
    assert found[0] == pytest.approx(0.0631)
    assert found[1] == date(2026, 10, 1)
    assert await live(answer({"observations": []})).mortgage_rate() is None


async def test_geoapify_keeps_only_street_addresses() -> None:
    body = {
        "results": [
            {
                "housenumber": "1420",
                "address_line1": "1420 N 14th St",
                "city": "Sheboygan",
                "state_code": "WI",
                "postcode": "53081",
                "lat": 43.7,
                "lon": -87.7,
            },
            {"address_line1": "Sheboygan", "city": "Sheboygan"},
        ]
    }
    places = await live(answer(body)).autocomplete("1420 n 14")
    assert [p.line1 for p in places] == ["1420 N 14th St"]
