import httpx
import pytest
from sqlalchemy import func, select

from parcel.adapters.fixtures import FixtureData
from parcel.adapters.property_data import Estimate, Place, ProviderError
from parcel.db.models import Usage
from parcel.db.session import db
from parcel.settings import get_settings

from .conftest import Login

DUPLEX = "1420 N 14th St, Sheboygan, WI 53081"
RANCH = "2210 Kohler Ave, Sheboygan, WI 53081"


@pytest.fixture
def me(login: Login) -> dict[str, str]:
    return login("scout")


async def _lookup(
    client: httpx.AsyncClient, headers: dict[str, str], address: str
) -> httpx.Response:
    return await client.post("/v1/lookup", json={"address": address}, headers=headers)


async def test_a_lookup_fills_in_sourced_suggestions(
    client: httpx.AsyncClient, me: dict[str, str], property_data: FixtureData
) -> None:
    result = (await _lookup(client, me, DUPLEX)).json()
    s = result["suggestions"]
    assert s["price"]["value"] == 224_000
    assert s["price"]["source"]["kind"] == "rentcast"
    assert s["operations.monthly_rent"] == {
        "value": 2_350,
        "low": 2_150,
        "high": 2_560,
        "source": {
            "kind": "rentcast",
            "label": "RentCast rent estimate",
            "as_of": s["price"]["source"]["as_of"],
        },
    }
    assert s["operations.property_tax_annual"]["value"] == round(224_000 * 0.0174)
    assert "Census ACS 2023" in s["operations.property_tax_annual"]["source"]["label"]
    assert s["operations.insurance_annual"]["source"]["kind"] == "estimate"
    assert s["interest_rate"]["value"] == 0.0681
    assert result["facts"]["bedrooms"] == 4
    assert result["address"]["county"] == "Sheboygan County"
    assert len(result["rent_comparables"]) == 4
    assert property_data.calls == [f"rent:{_key(DUPLEX)}", f"value:{_key(DUPLEX)}"]


def _key(address: str) -> str:
    return " ".join(address.upper().replace(",", " ").split())


async def test_repeat_lookups_come_from_the_cache(
    client: httpx.AsyncClient, me: dict[str, str], login: Login, property_data: FixtureData
) -> None:
    await _lookup(client, me, DUPLEX)
    await _lookup(client, login("someone-else"), DUPLEX)
    assert len(property_data.calls) == 2


async def test_a_wide_value_range_is_called_out(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    result = (await _lookup(client, me, RANCH)).json()
    assert any("wide range" in n for n in result["notes"])


async def test_daily_limit_falls_back_to_hud(
    client: httpx.AsyncClient, me: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LOOKUPS_PER_USER_PER_DAY", "1")
    get_settings.cache_clear()
    await _lookup(client, me, DUPLEX)
    result = (await _lookup(client, me, RANCH)).json()
    rent = result["suggestions"]["operations.monthly_rent"]
    assert rent["source"]["kind"] == "hud"
    assert rent["value"] == 1_180 + 220 * 3
    assert "price" not in result["suggestions"]
    assert any("today's address lookups" in n for n in result["notes"])
    get_settings.cache_clear()


async def test_monthly_budget_is_shared_by_everyone(
    client: httpx.AsyncClient, me: dict[str, str], login: Login, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("RENTCAST_MONTHLY_BUDGET", "3")
    get_settings.cache_clear()
    await _lookup(client, me, DUPLEX)
    result = (await _lookup(client, login("another"), RANCH)).json()
    assert any("budget is used up" in n for n in result["notes"])
    get_settings.cache_clear()


async def test_unknown_addresses(client: httpx.AsyncClient, me: dict[str, str]) -> None:
    response = await _lookup(client, me, "1 Nowhere Rd, Atlantis, ZZ 00000")
    assert response.status_code == 404
    assert response.json()["code"] == "address_not_found"


class FlakyData(FixtureData):
    async def rent_estimate(self, place: Place) -> Estimate:
        raise ProviderError(f"down for {place.key}")


async def test_a_provider_outage_still_returns_a_rent(
    app: object, me: dict[str, str], client: httpx.AsyncClient
) -> None:
    app.state.property_data = FlakyData()  # type: ignore[attr-defined]
    result = (await _lookup(client, me, DUPLEX)).json()
    assert result["suggestions"]["operations.monthly_rent"]["source"]["kind"] == "hud"
    assert any("didn't come back" in n for n in result["notes"])


async def test_autocomplete(client: httpx.AsyncClient, me: dict[str, str]) -> None:
    found = (
        await client.get("/v1/lookup/autocomplete", params={"q": "1420 N 14"}, headers=me)
    ).json()
    assert found == [
        {
            "line1": "1420 N 14th St",
            "city": "Sheboygan",
            "state": "WI",
            "zip": "53081",
            "label": "1420 N 14th St, Sheboygan, WI 53081",
        }
    ]


async def test_demo_lookups_are_labeled_as_samples(client: httpx.AsyncClient) -> None:
    token = (await client.post("/v1/demo")).json()["token"]
    result = (await _lookup(client, {"authorization": f"Bearer {token}"}, DUPLEX)).json()
    assert result["notes"][0].startswith("Demo lookups use recorded sample figures")


async def test_demo_lookups_cost_nothing(client: httpx.AsyncClient, me: dict[str, str]) -> None:
    for _ in range(3):
        token = (await client.post("/v1/demo")).json()["token"]
        demo = {"authorization": f"Bearer {token}"}
        for address in (DUPLEX, RANCH):
            result = (await _lookup(client, demo, address)).json()
            assert result["suggestions"]["price"]["source"]["kind"] == "rentcast"
    async with db.as_system() as session:
        spent = await session.scalar(
            select(func.coalesce(func.sum(Usage.count), 0)).where(Usage.bucket == "rentcast:month")
        )
    assert spent == 0
    assert (await _lookup(client, me, DUPLEX)).json()["notes"] == []


async def test_demo_samples_never_serve_real_lookups(
    client: httpx.AsyncClient, me: dict[str, str], property_data: FixtureData
) -> None:
    token = (await client.post("/v1/demo")).json()["token"]
    await _lookup(client, {"authorization": f"Bearer {token}"}, DUPLEX)
    assert property_data.calls == []
    result = (await _lookup(client, me, DUPLEX)).json()
    assert result["notes"] == []
    assert property_data.calls == [f"rent:{_key(DUPLEX)}", f"value:{_key(DUPLEX)}"]


async def test_autocomplete_is_rationed_and_cached(
    client: httpx.AsyncClient, me: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AUTOCOMPLETES_PER_USER_PER_DAY", "1")
    get_settings.cache_clear()
    params = {"q": "1420 N 14"}
    assert len((await client.get("/v1/lookup/autocomplete", params=params, headers=me)).json()) == 1
    assert len((await client.get("/v1/lookup/autocomplete", params=params, headers=me)).json()) == 1
    limited = await client.get("/v1/lookup/autocomplete", params={"q": "2210 Koh"}, headers=me)
    assert limited.status_code == 429
    get_settings.cache_clear()
