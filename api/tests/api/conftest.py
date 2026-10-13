import asyncio
import os
import time
import uuid
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Any, Protocol

import httpx
import jwt
import pytest
from alembic import command
from alembic.config import Config
from asgi_lifespan import LifespanManager
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

ADMIN_URL = make_url(
    os.environ.get("TEST_ADMIN_URL", "postgresql+asyncpg://parcel:parcel@localhost:5433/parcel")
)
if ADMIN_URL.drivername in {"postgres", "postgresql"}:
    ADMIN_URL = ADMIN_URL.set(drivername="postgresql+asyncpg")
TEST_DB = "parcel_test"
TEST_URL = ADMIN_URL.set(database=TEST_DB).render_as_string(hide_password=False)
ISSUER = "https://clerk.test.parcel"
ORIGIN = "http://localhost:5173"

os.environ.update(
    DATABASE_URL=TEST_URL,
    CLERK_ISSUER=ISSUER,
    WEB_ORIGINS=f'["{ORIGIN}"]',
    PROVIDERS="fixtures",
    SECRET_KEY="test-secret-key-that-is-long-enough-for-hs256",
    STRIPE_WEBHOOK_SECRET="whsec_test_stripe",
    CLERK_WEBHOOK_SECRET="whsec_dGVzdC1jbGVyay13ZWJob29rLXNlY3JldA==",
)

from parcel.adapters.fixtures import FixtureData  # noqa: E402
from parcel.app import create_app  # noqa: E402
from parcel.db.models import Base  # noqa: E402
from parcel.db.session import db  # noqa: E402
from parcel.settings import get_settings  # noqa: E402

from ..writer import FakeWriter  # noqa: E402


class Keys:
    """Stands in for Clerk: holds signing keys and serves them as a JWKS."""

    def __init__(self) -> None:
        self.current = self._new()
        self.published = [self.current]
        self.jwks_requests = 0
        self.down = False

    @staticmethod
    def _new() -> tuple[str, Any]:
        return uuid.uuid4().hex[:12], rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def rotate(self) -> None:
        self.current = self._new()
        self.published.append(self.current)

    def jwks(self) -> dict[str, Any]:
        keys = []
        for kid, key in self.published:
            jwk = jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key(), as_dict=True)
            keys.append({**jwk, "kid": kid, "alg": "RS256", "use": "sig"})
        return {"keys": keys}

    def token(self, sub: str, **claims: Any) -> str:
        kid, key = self.current
        now = int(time.time())
        body = {"sub": sub, "iss": ISSUER, "iat": now, "exp": now + 300, "azp": ORIGIN, **claims}
        return jwt.encode(body, key, algorithm="RS256", headers={"kid": kid})


@pytest.fixture(scope="session")
def keys() -> Keys:
    return Keys()


@pytest.fixture(scope="session", autouse=True)
async def database() -> AsyncIterator[None]:
    admin = create_async_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.execute(text(f"drop database if exists {TEST_DB} with (force)"))
        await conn.execute(text(f"create database {TEST_DB}"))
    await admin.dispose()
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", TEST_URL.replace("%", "%%"))
    await asyncio.to_thread(command.upgrade, config, "head")
    yield
    await db.dispose()


@pytest.fixture(autouse=True)
async def clean() -> AsyncIterator[None]:
    yield
    # Not in the metadata, so alembic_version keeps its row.
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    async with db.engine.begin() as conn:
        await conn.execute(text(f"truncate {tables} cascade"))


@pytest.fixture
def property_data() -> FixtureData:
    return FixtureData()


class FakeBilling:
    def __init__(self) -> None:
        self.checkouts: list[dict[str, object]] = []

    async def checkout_url(
        self, *, user_id: str, email: str | None, customer_id: str | None, return_to: str
    ) -> str:
        self.checkouts.append({"user_id": user_id, "email": email, "customer_id": customer_id})
        return f"https://checkout.stripe.test/session?back={return_to}"

    async def portal_url(self, *, customer_id: str, return_to: str) -> str:
        return f"https://billing.stripe.test/{customer_id}?back={return_to}"


@pytest.fixture
def billing() -> FakeBilling:
    return FakeBilling()


@pytest.fixture
def writer() -> FakeWriter:
    return FakeWriter()


@pytest.fixture
async def app(
    keys: Keys, property_data: FixtureData, billing: FakeBilling, writer: FakeWriter
) -> AsyncIterator[FastAPI]:
    get_settings.cache_clear()

    async def clerk(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/.well-known/jwks.json":
            keys.jwks_requests += 1
            # A real fetch gives other requests a turn, which is when they'd see keys missing.
            await asyncio.sleep(0)
            if keys.down:
                return httpx.Response(503)
            return httpx.Response(200, json=keys.jwks())
        return httpx.Response(404)

    outbound = httpx.AsyncClient(transport=httpx.MockTransport(clerk))
    application = create_app(
        http=outbound, property_data=property_data, billing=billing, writer=writer
    )
    async with LifespanManager(application):
        yield application
    await outbound.aclose()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://api.test") as c:
        yield c


class Login(Protocol):
    def __call__(self, sub: str, **claims: object) -> dict[str, str]: ...


@pytest.fixture
def login(keys: Keys) -> Login:
    def headers(sub: str, **claims: object) -> dict[str, str]:
        return {"authorization": f"Bearer {keys.token(sub, **claims)}"}

    return headers


class OverrideSettings(Protocol):
    def __call__(self, **env: str) -> None: ...


@pytest.fixture
def settings_override() -> Iterator[OverrideSettings]:
    """Sets environment variables for one test and drops the cached settings afterwards."""
    with pytest.MonkeyPatch.context() as patch:

        def apply(**env: str) -> None:
            for name, value in env.items():
                patch.setenv(name, value)
            get_settings.cache_clear()

        yield apply
    get_settings.cache_clear()


RENTAL = {
    "strategy": "buy_and_hold",
    "price": 250_000,
    "operations": {"monthly_rent": 2_000, "property_tax_annual": 3_000, "insurance_annual": 1_200},
}


def deal_body(name: str = "Duplex", **overrides: Any) -> dict[str, Any]:
    return {"name": name, "inputs": {**RENTAL, **overrides}}
