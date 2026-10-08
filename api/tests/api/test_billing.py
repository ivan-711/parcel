import hashlib
import hmac
import json
import time
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select
from svix.webhooks import Webhook

from parcel.db.models import User
from parcel.db.session import db
from parcel.settings import get_settings

from .conftest import FakeBilling, Login


def stripe_signed(
    event: dict[str, Any], secret: str = "whsec_test_stripe"
) -> tuple[bytes, dict[str, str]]:
    payload = json.dumps(event).encode()
    ts = int(time.time())
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return payload, {"stripe-signature": f"t={ts},v1={sig}", "content-type": "application/json"}


async def _me(client: httpx.AsyncClient, headers: dict[str, str]) -> dict[str, Any]:
    body: dict[str, Any] = (await client.get("/v1/me", headers=headers)).json()
    return body


async def test_checkout_hands_back_a_stripe_url(
    client: httpx.AsyncClient, login: Login, billing: FakeBilling
) -> None:
    headers = login("buyer", email="buyer@example.com")
    me = await _me(client, headers)
    response = await client.post("/v1/billing/checkout", headers=headers)
    assert response.json()["url"].startswith("https://checkout.stripe.test/session")
    assert billing.checkouts == [
        {"user_id": me["id"], "email": "buyer@example.com", "customer_id": None}
    ]


async def test_demo_accounts_cannot_subscribe(client: httpx.AsyncClient) -> None:
    token = (await client.post("/v1/demo")).json()["token"]
    response = await client.post(
        "/v1/billing/checkout", headers={"authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403


async def test_portal_needs_a_subscription_first(client: httpx.AsyncClient, login: Login) -> None:
    response = await client.post("/v1/billing/portal", headers=login("buyer"))
    assert response.status_code == 409


async def test_checkout_then_cancel_moves_the_plan(client: httpx.AsyncClient, login: Login) -> None:
    headers = login("buyer")
    me = await _me(client, headers)
    completed = {
        "id": "evt_1",
        "type": "checkout.session.completed",
        "data": {"object": {"client_reference_id": me["id"], "customer": "cus_123"}},
    }
    payload, sig = stripe_signed(completed)
    assert (await client.post("/webhooks/stripe", content=payload, headers=sig)).status_code == 204
    assert (await _me(client, headers))["plan"] == "pro"

    portal = await client.post("/v1/billing/portal", headers=headers)
    assert portal.json()["url"].startswith("https://billing.stripe.test/cus_123")

    deleted = {
        "id": "evt_2",
        "type": "customer.subscription.deleted",
        "data": {"object": {"customer": "cus_123", "status": "canceled"}},
    }
    payload, sig = stripe_signed(deleted)
    await client.post("/webhooks/stripe", content=payload, headers=sig)
    assert (await _me(client, headers))["plan"] == "free"


async def test_replayed_events_are_applied_once(client: httpx.AsyncClient, login: Login) -> None:
    headers = login("buyer")
    me = await _me(client, headers)
    completed = {
        "id": "evt_1",
        "type": "checkout.session.completed",
        "data": {"object": {"client_reference_id": me["id"], "customer": "cus_123"}},
    }
    payload, sig = stripe_signed(completed)
    await client.post("/webhooks/stripe", content=payload, headers=sig)
    lapsed = {
        "id": "evt_2",
        "type": "customer.subscription.updated",
        "data": {"object": {"customer": "cus_123", "status": "unpaid"}},
    }
    payload2, sig2 = stripe_signed(lapsed)
    await client.post("/webhooks/stripe", content=payload2, headers=sig2)
    assert (await client.post("/webhooks/stripe", content=payload, headers=sig)).status_code == 204
    assert (await _me(client, headers))["plan"] == "free"


async def test_unsigned_stripe_events_are_rejected(client: httpx.AsyncClient) -> None:
    payload, sig = stripe_signed(
        {"id": "evt_x", "type": "x", "data": {"object": {}}}, secret="wrong"
    )
    assert (await client.post("/webhooks/stripe", content=payload, headers=sig)).status_code == 400


def clerk_signed(event: dict[str, Any]) -> tuple[bytes, dict[str, str]]:
    payload = json.dumps(event).encode()
    msg_id = f"msg_{uuid.uuid4().hex}"
    now = datetime.now(UTC)
    wh = Webhook("whsec_dGVzdC1jbGVyay13ZWJob29rLXNlY3JldA==")
    signature = wh.sign(msg_id, now, payload.decode())
    return payload, {
        "svix-id": msg_id,
        "svix-timestamp": str(int(now.timestamp())),
        "svix-signature": signature,
        "content-type": "application/json",
    }


async def test_deleting_the_clerk_account_deletes_the_user(
    client: httpx.AsyncClient, login: Login
) -> None:
    await client.get("/v1/me", headers=login("leaving"))
    updated = {
        "type": "user.updated",
        "data": {
            "id": "leaving",
            "first_name": "Pat",
            "last_name": "Lee",
            "primary_email_address_id": "e1",
            "email_addresses": [{"id": "e1", "email_address": "pat@example.com"}],
        },
    }
    payload, headers = clerk_signed(updated)
    assert (
        await client.post("/webhooks/clerk", content=payload, headers=headers)
    ).status_code == 204
    async with db.as_system() as session:
        user = await session.scalar(select(User).where(User.clerk_id == "leaving"))
        assert user is not None
        assert (user.name, user.email) == ("Pat Lee", "pat@example.com")

    payload, headers = clerk_signed({"type": "user.deleted", "data": {"id": "leaving"}})
    await client.post("/webhooks/clerk", content=payload, headers=headers)
    async with db.as_system() as session:
        assert await session.scalar(select(func.count()).select_from(User)) == 0


async def test_unsigned_clerk_events_are_rejected(client: httpx.AsyncClient) -> None:
    payload = json.dumps({"type": "user.deleted", "data": {"id": "x"}}).encode()
    response = await client.post("/webhooks/clerk", content=payload, headers={"svix-id": "m"})
    assert response.status_code == 400


@pytest.mark.parametrize(("path", "variable"), [("stripe", "STRIPE"), ("clerk", "CLERK")])
async def test_webhooks_without_a_secret_refuse_everything(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch, path: str, variable: str
) -> None:
    monkeypatch.setenv(f"{variable}_WEBHOOK_SECRET", "")
    get_settings.cache_clear()
    payload, sig = stripe_signed({"id": "evt_y", "type": "x", "data": {"object": {}}}, secret="")
    response = await client.post(f"/webhooks/{path}", content=payload, headers=sig)
    assert response.status_code == 503
    assert response.json()["code"] == "webhooks_off"
