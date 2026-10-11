import time
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import jwt
import pytest
from fastapi import FastAPI
from sqlalchemy import func, select, update

from parcel.db.models import User
from parcel.db.session import db
from parcel.http.auth import demo_token

from .conftest import Keys, Login


async def test_requests_without_a_token_are_turned_away(client: httpx.AsyncClient) -> None:
    response = await client.get("/v1/me")
    assert response.status_code == 401
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["code"] == "unauthenticated"


async def test_first_request_creates_the_user_once(client: httpx.AsyncClient, login: Login) -> None:
    for _ in range(3):
        response = await client.get("/v1/me", headers=login("user_a", email="a@example.com"))
        assert response.status_code == 200
    assert response.json()["email"] == "a@example.com"
    async with db.as_system() as session:
        assert await session.scalar(select(func.count()).select_from(User)) == 1


async def test_a_rotated_signing_key_is_picked_up(
    app: FastAPI, client: httpx.AsyncClient, login: Login, keys: Keys
) -> None:
    assert (await client.get("/v1/me", headers=login("user_a"))).status_code == 200
    before = keys.jwks_requests
    keys.rotate()
    app.state.clerk.min_refresh_gap = 0
    assert (await client.get("/v1/me", headers=login("user_a"))).status_code == 200
    assert keys.jwks_requests == before + 1


async def test_unknown_signing_keys_do_not_refetch_within_the_gap(
    client: httpx.AsyncClient, keys: Keys
) -> None:
    before = keys.jwks_requests
    first = {"authorization": f"Bearer {Keys().token('user_a')}"}
    assert (await client.get("/v1/me", headers=first)).status_code == 401
    assert keys.jwks_requests == before + 1

    second = {"authorization": f"Bearer {Keys().token('user_b')}"}
    assert (await client.get("/v1/me", headers=second)).status_code == 401
    assert keys.jwks_requests == before + 1


async def test_cached_keys_outlast_a_clerk_outage(
    app: FastAPI, client: httpx.AsyncClient, login: Login, keys: Keys
) -> None:
    assert (await client.get("/v1/me", headers=login("user_a"))).status_code == 200
    keys.down = True
    try:
        app.state.clerk._fetched_at = 0
        assert (await client.get("/v1/me", headers=login("user_a"))).status_code == 200
        before = keys.jwks_requests
        assert (await client.get("/v1/me", headers=login("user_a"))).status_code == 200
        assert keys.jwks_requests == before
    finally:
        keys.down = False


async def test_no_keys_at_all_is_an_outage_not_a_bad_token(
    app: FastAPI, client: httpx.AsyncClient, login: Login, keys: Keys
) -> None:
    keys.down = True
    try:
        app.state.clerk._keys = {}
        app.state.clerk._tried_at = 0
        response = await client.get("/v1/me", headers=login("user_a"))
        assert response.status_code == 503
        assert response.json()["code"] == "auth_unavailable"
    finally:
        keys.down = False


@pytest.mark.parametrize(
    "claims",
    [
        {"exp": int(time.time()) - 60},
        {"iss": "https://someone-else.example"},
        {"azp": "https://evil.example"},
    ],
    ids=["expired", "wrong issuer", "wrong origin"],
)
async def test_bad_tokens_are_rejected(
    client: httpx.AsyncClient, login: Login, claims: dict[str, object]
) -> None:
    assert (await client.get("/v1/me", headers=login("user_a", **claims))).status_code == 401


async def test_a_token_signed_by_a_stranger_is_rejected(client: httpx.AsyncClient) -> None:
    forged = Keys().token("user_a")
    response = await client.get("/v1/me", headers={"authorization": f"Bearer {forged}"})
    assert response.status_code == 401


async def test_garbage_tokens_are_rejected(client: httpx.AsyncClient) -> None:
    for header in ("Bearer not-a-jwt", "Basic dXNlcjpwYXNz", "Bearer"):
        assert (await client.get("/v1/me", headers={"authorization": header})).status_code == 401


async def test_a_demo_session_works_until_it_expires(client: httpx.AsyncClient) -> None:
    started = await client.post("/v1/demo")
    assert started.status_code == 201
    headers = {"authorization": f"Bearer {started.json()['token']}"}
    me = await client.get("/v1/me", headers=headers)
    assert me.json()["is_demo"] is True
    async with db.as_system() as session:
        await session.execute(
            update(User).values(demo_expires_at=datetime.now(UTC) - timedelta(minutes=1))
        )
    expired = await client.get("/v1/me", headers=headers)
    assert expired.status_code == 401
    assert expired.json()["code"] == "demo_expired"


async def test_a_forged_demo_token_is_rejected(client: httpx.AsyncClient) -> None:
    started = await client.post("/v1/demo")
    user_id = jwt.decode(started.json()["token"], options={"verify_signature": False})["sub"]
    forged = jwt.encode(
        {"iss": "parcel-demo", "sub": user_id, "exp": datetime.now(UTC) + timedelta(days=9)},
        "guessed-secret-guessed-secret-guessed",
        algorithm="HS256",
    )
    response = await client.get("/v1/me", headers={"authorization": f"Bearer {forged}"})
    assert response.status_code == 401


async def test_demo_tokens_for_missing_users_are_rejected(client: httpx.AsyncClient) -> None:
    token = demo_token(uuid.uuid4(), datetime.now(UTC) + timedelta(hours=1))
    response = await client.get("/v1/me", headers={"authorization": f"Bearer {token}"})
    assert response.status_code == 401


async def test_a_demo_token_cannot_stand_in_for_a_real_account(
    client: httpx.AsyncClient, login: Login
) -> None:
    me = (await client.get("/v1/me", headers=login("owner"))).json()
    token = demo_token(uuid.UUID(me["id"]), datetime.now(UTC) + timedelta(hours=1))
    response = await client.get("/v1/me", headers={"authorization": f"Bearer {token}"})
    assert response.status_code == 401
