"""Clients for the public and paid data sources a property lookup draws on.

Each client does one request and returns plain dataclasses. Caching, budgets
and fallbacks are the lookup service's job, not theirs.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Protocol

import httpx


class ProviderError(Exception):
    pass


@dataclass(frozen=True)
class Place:
    line1: str
    city: str
    state: str
    zip: str
    latitude: float | None = None
    longitude: float | None = None
    state_fips: str | None = None
    county_fips: str | None = None
    county: str | None = None

    @property
    def one_line(self) -> str:
        return f"{self.line1}, {self.city}, {self.state} {self.zip}".strip(", ")

    @property
    def key(self) -> str:
        return " ".join(self.one_line.upper().replace(",", " ").split())


@dataclass(frozen=True)
class Comparable:
    address: str
    price: float
    bedrooms: float | None
    bathrooms: float | None
    square_feet: float | None
    distance_miles: float | None
    days_old: int | None


@dataclass(frozen=True)
class Facts:
    property_type: str | None = None
    bedrooms: float | None = None
    bathrooms: float | None = None
    square_feet: float | None = None
    year_built: int | None = None
    last_sale_price: float | None = None
    last_sale_date: str | None = None


@dataclass(frozen=True)
class Estimate:
    value: float
    low: float
    high: float
    place: Place
    facts: Facts
    comparables: list[Comparable] = field(default_factory=list)


class PropertyData(Protocol):
    async def autocomplete(self, text: str) -> list[Place]: ...
    async def geocode(self, address: str) -> Place | None: ...
    async def rent_estimate(self, place: Place) -> Estimate: ...
    async def value_estimate(self, place: Place) -> Estimate: ...
    async def county_tax_rate(
        self, state_fips: str, county_fips: str
    ) -> tuple[float, int] | None: ...
    async def fair_market_rent(self, place: Place, bedrooms: int) -> tuple[float, int] | None: ...
    async def mortgage_rate(self) -> tuple[float, date] | None: ...


def _num(x: Any) -> float | None:
    try:
        return None if x is None else float(x)
    except (TypeError, ValueError):
        return None


class LiveData:
    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        rentcast_key: str,
        geoapify_key: str,
        fred_key: str,
        hud_token: str,
        acs_year: int = 2023,
    ) -> None:
        self.http = client
        self.rentcast_key = rentcast_key
        self.geoapify_key = geoapify_key
        self.fred_key = fred_key
        self.hud_token = hud_token
        self.acs_year = acs_year

    async def _get(self, url: str, **kwargs: Any) -> Any:
        try:
            response = await self.http.get(url, timeout=10, **kwargs)
        except httpx.HTTPError as e:
            raise ProviderError(f"{url} unreachable") from e
        if response.status_code >= 400:
            raise ProviderError(f"{url} returned {response.status_code}")
        return response.json()

    async def autocomplete(self, text: str) -> list[Place]:
        body = await self._get(
            "https://api.geoapify.com/v1/geocode/autocomplete",
            params={
                "text": text,
                "filter": "countrycode:us",
                "type": "amenity,building,street",
                "format": "json",
                "limit": 6,
                "apiKey": self.geoapify_key,
            },
        )
        places = []
        for r in body.get("results", []):
            if not r.get("housenumber"):
                continue
            places.append(
                Place(
                    line1=r.get("address_line1", ""),
                    city=r.get("city", ""),
                    state=r.get("state_code", ""),
                    zip=r.get("postcode", ""),
                    latitude=_num(r.get("lat")),
                    longitude=_num(r.get("lon")),
                    county=r.get("county"),
                )
            )
        return places

    async def geocode(self, address: str) -> Place | None:
        body = await self._get(
            "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress",
            params={
                "address": address,
                "benchmark": "Public_AR_Current",
                "vintage": "Current_Current",
                "layers": "Counties",
                "format": "json",
            },
        )
        matches = body.get("result", {}).get("addressMatches", [])
        if not matches:
            return None
        m = matches[0]
        parts = m.get("addressComponents", {})
        counties = m.get("geographies", {}).get("Counties", [{}])
        line1 = m["matchedAddress"].split(",")[0].title()
        return Place(
            line1=line1,
            city=parts.get("city", "").title(),
            state=parts.get("state", ""),
            zip=parts.get("zip", ""),
            latitude=_num(m.get("coordinates", {}).get("y")),
            longitude=_num(m.get("coordinates", {}).get("x")),
            state_fips=counties[0].get("STATE"),
            county_fips=counties[0].get("COUNTY"),
            county=counties[0].get("NAME"),
        )

    async def _rentcast(self, path: str, place: Place) -> Any:
        return await self._get(
            f"https://api.rentcast.io/v1/avm/{path}",
            params={"address": place.one_line, "lookupSubjectAttributes": "true", "compCount": 10},
            headers={"X-Api-Key": self.rentcast_key, "Accept": "application/json"},
        )

    async def rent_estimate(self, place: Place) -> Estimate:
        body = await self._rentcast("rent/long-term", place)
        return _estimate(body, "rent", place)

    async def value_estimate(self, place: Place) -> Estimate:
        body = await self._rentcast("value", place)
        return _estimate(body, "price", place)

    async def county_tax_rate(self, state_fips: str, county_fips: str) -> tuple[float, int] | None:
        """Median property tax paid over median home value for the county (ACS 5-year)."""
        body = await self._get(
            f"https://api.census.gov/data/{self.acs_year}/acs/acs5",
            params={
                "get": "B25103_001E,B25077_001E",
                "for": f"county:{county_fips}",
                "in": f"state:{state_fips}",
            },
        )
        if len(body) < 2:
            return None
        taxes, value = _num(body[1][0]), _num(body[1][1])
        if not taxes or not value or taxes <= 0 or value <= 0:
            return None
        return taxes / value, self.acs_year

    async def fair_market_rent(self, place: Place, bedrooms: int) -> tuple[float, int] | None:
        if not (place.state_fips and place.county_fips):
            return None
        entity = f"{place.state_fips}{place.county_fips}99999"
        body = await self._get(
            f"https://www.huduser.gov/hudapi/public/fmr/data/{entity}",
            headers={"Authorization": f"Bearer {self.hud_token}"},
        )
        data = body.get("data", {}).get("basicdata")
        if isinstance(data, list):
            data = next((d for d in data if d.get("zip_code") == place.zip), None) or (
                data[0] if data else None
            )
        if not data:
            return None
        column = ["Efficiency", "One-Bedroom", "Two-Bedroom", "Three-Bedroom", "Four-Bedroom"]
        rent = _num(data.get(column[max(0, min(bedrooms, 4))]))
        year = int(_num(data.get("year")) or date.today().year)
        return (rent, year) if rent else None

    async def mortgage_rate(self) -> tuple[float, date] | None:
        body = await self._get(
            "https://api.stlouisfed.org/fred/series/observations",
            params={
                "series_id": "MORTGAGE30US",
                "api_key": self.fred_key,
                "file_type": "json",
                "sort_order": "desc",
                "limit": 5,
            },
        )
        for obs in body.get("observations", []):
            rate = _num(obs.get("value"))
            if rate is not None:
                return rate / 100, date.fromisoformat(obs["date"])
        return None


def _estimate(body: dict[str, Any], key: str, place: Place) -> Estimate:
    value = _num(body.get(key))
    if value is None:
        raise ProviderError("no estimate returned for this address")
    subject = body.get("subjectProperty") or {}
    refined = Place(
        line1=subject.get("addressLine1") or place.line1,
        city=subject.get("city") or place.city,
        state=subject.get("state") or place.state,
        zip=subject.get("zipCode") or place.zip,
        latitude=_num(subject.get("latitude")) or place.latitude,
        longitude=_num(subject.get("longitude")) or place.longitude,
        state_fips=subject.get("stateFips") or place.state_fips,
        county_fips=(subject.get("countyFips") or place.county_fips),
        county=subject.get("county") or place.county,
    )
    facts = Facts(
        property_type=subject.get("propertyType"),
        bedrooms=_num(subject.get("bedrooms")),
        bathrooms=_num(subject.get("bathrooms")),
        square_feet=_num(subject.get("squareFootage")),
        year_built=int(y) if (y := _num(subject.get("yearBuilt"))) else None,
        last_sale_price=_num(subject.get("lastSalePrice")),
        last_sale_date=(subject.get("lastSaleDate") or "")[:10] or None,
    )
    comps = [
        Comparable(
            address=c.get("formattedAddress", ""),
            price=p,
            bedrooms=_num(c.get("bedrooms")),
            bathrooms=_num(c.get("bathrooms")),
            square_feet=_num(c.get("squareFootage")),
            distance_miles=_num(c.get("distance")),
            days_old=int(d) if (d := _num(c.get("daysOld"))) is not None else None,
        )
        for c in body.get("comparables", [])
        if (p := _num(c.get("price"))) is not None
    ]
    return Estimate(
        value=value,
        low=_num(body.get(f"{key}RangeLow")) or value,
        high=_num(body.get(f"{key}RangeHigh")) or value,
        place=refined,
        facts=facts,
        comparables=comps[:6],
    )
