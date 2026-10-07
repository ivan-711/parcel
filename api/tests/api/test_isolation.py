import uuid

import httpx
import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError

from parcel.db.models import Deal, User
from parcel.db.session import db

from .conftest import Login, deal_body


async def _user_id(client: httpx.AsyncClient, headers: dict[str, str]) -> uuid.UUID:
    return uuid.UUID((await client.get("/v1/me", headers=headers)).json()["id"])


async def test_one_user_cannot_see_or_touch_another_users_deals(
    client: httpx.AsyncClient, login: Login
) -> None:
    alice, bob = login("alice"), login("bob")
    created = await client.post("/v1/deals", json=deal_body(), headers=alice)
    deal_id = created.json()["id"]

    assert (await client.get("/v1/deals", headers=bob)).json() == []
    for method, path in [
        ("GET", f"/v1/deals/{deal_id}"),
        ("PATCH", f"/v1/deals/{deal_id}"),
        ("DELETE", f"/v1/deals/{deal_id}"),
        ("POST", f"/v1/deals/{deal_id}/share"),
    ]:
        body = {"name": "mine now"} if method == "PATCH" else None
        response = await client.request(method, path, headers=bob, json=body)
        assert response.status_code == 404, (method, path)
    assert (await client.get(f"/v1/deals/{deal_id}", headers=alice)).status_code == 200


async def test_the_database_itself_enforces_isolation(
    client: httpx.AsyncClient, login: Login
) -> None:
    alice, bob = login("alice"), login("bob")
    await client.post("/v1/deals", json=deal_body(), headers=alice)
    bob_id = await _user_id(client, bob)
    alice_id = await _user_id(client, alice)

    async with db.as_user(bob_id) as session:
        assert await session.scalar(text("select count(*) from deals")) == 0
        assert await session.scalar(select(func.count()).select_from(User)) == 1

    async with db.as_user(bob_id) as session:
        session.add(Deal(owner_id=alice_id, name="planted", strategy="flip", inputs={}))
        with pytest.raises(DBAPIError, match="row-level security"):
            await session.flush()


async def test_comparing_someone_elses_deal_is_not_found(
    client: httpx.AsyncClient, login: Login
) -> None:
    alice, bob = login("alice"), login("bob")
    a = (await client.post("/v1/deals", json=deal_body(), headers=alice)).json()["id"]
    b = (await client.post("/v1/deals", json=deal_body(), headers=bob)).json()["id"]
    response = await client.get("/v1/compare", params=[("ids", a), ("ids", b)], headers=bob)
    assert response.status_code == 404
