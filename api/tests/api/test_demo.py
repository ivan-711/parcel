from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import func, select, update

from parcel.db.models import Deal, User
from parcel.db.session import db
from parcel.domain.demo import SAMPLES, remove_expired

from .conftest import OverrideSettings


async def test_the_sandbox_comes_stocked(client: httpx.AsyncClient) -> None:
    token = (await client.post("/v1/demo")).json()["token"]
    headers = {"authorization": f"Bearer {token}"}
    deals = (await client.get("/v1/deals", headers=headers)).json()
    assert len(deals) == len(SAMPLES)
    assert {d["strategy"] for d in deals} == {
        "buy_and_hold",
        "brrrr",
        "flip",
        "creative",
        "wholesale",
    }
    portfolio = (await client.get("/v1/portfolio", headers=headers)).json()
    [owned] = portfolio["properties"]
    assert sum(m["actual_cash_flow"] is not None for m in owned["months"]) == 12


async def test_each_visitor_gets_their_own_copy(client: httpx.AsyncClient) -> None:
    first = {"authorization": f"Bearer {(await client.post('/v1/demo')).json()['token']}"}
    second = {"authorization": f"Bearer {(await client.post('/v1/demo')).json()['token']}"}
    deal_id = (await client.get("/v1/deals", headers=first)).json()[0]["id"]
    await client.delete(f"/v1/deals/{deal_id}", headers=first)
    assert len((await client.get("/v1/deals", headers=second)).json()) == len(SAMPLES)


async def test_demos_are_rationed_per_visitor(
    client: httpx.AsyncClient, settings_override: OverrideSettings
) -> None:
    settings_override(DEMOS_PER_IP_PER_DAY="2")
    assert (await client.post("/v1/demo")).status_code == 201
    assert (await client.post("/v1/demo")).status_code == 201
    third = await client.post("/v1/demo")
    assert third.status_code == 429
    assert third.json()["code"] == "demo_limit"


async def test_expired_sandboxes_are_cleaned_up(client: httpx.AsyncClient) -> None:
    await client.post("/v1/demo")
    async with db.as_system() as session:
        removed = await remove_expired(session, now=datetime.now(UTC) + timedelta(days=2))
        assert removed == 1
        assert await session.scalar(select(func.count()).select_from(User)) == 0
        assert await session.scalar(select(func.count()).select_from(Deal)) == 0


async def test_starting_a_demo_clears_out_old_ones(client: httpx.AsyncClient) -> None:
    await client.post("/v1/demo")
    async with db.as_system() as session:
        await session.execute(update(User).values(demo_expires_at=datetime.now(UTC)))
    await client.post("/v1/demo")
    async with db.as_system() as session:
        assert await session.scalar(select(func.count()).select_from(User)) == 1
        assert await session.scalar(select(func.count()).select_from(Deal)) == len(SAMPLES)
