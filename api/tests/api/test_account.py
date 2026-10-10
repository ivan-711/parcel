import httpx

from .conftest import Login


async def test_profile_updates(client: httpx.AsyncClient, login: Login) -> None:
    me = login("someone")
    body = {"name": "Ivan", "defaults": {"vacancy_rate": 0.06, "interest_rate": 0.0675}}
    updated = (await client.patch("/v1/me", json=body, headers=me)).json()
    assert updated["name"] == "Ivan"
    assert updated["defaults"] == {"vacancy_rate": 0.06, "interest_rate": 0.0675}
    assert (await client.get("/v1/me", headers=me)).json()["name"] == "Ivan"


async def test_email_follows_the_identity_provider(client: httpx.AsyncClient, login: Login) -> None:
    await client.get("/v1/me", headers=login("someone", email="old@example.com"))
    me = await client.get("/v1/me", headers=login("someone", email="new@example.com", name="New"))
    assert me.json()["email"] == "new@example.com"
    assert me.json()["name"] == "New"


async def test_health_checks(client: httpx.AsyncClient) -> None:
    assert (await client.get("/healthz")).json() == {"status": "ok"}
    ready = await client.get("/readyz")
    assert ready.json()["status"] == "ready"
    assert "x-request-id" in ready.headers


async def test_clearing_the_name(client: httpx.AsyncClient, login: Login) -> None:
    me = login("landlord")
    await client.patch("/v1/me", json={"name": "Dana"}, headers=me)
    assert (await client.patch("/v1/me", json={"name": "  "}, headers=me)).json()["name"] is None
