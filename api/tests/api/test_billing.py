import asyncio
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

from .conftest import FakeBilling, Login, OverrideSettings


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


CHECKOUT = {"customer": "cus_123", "payment_status": "paid"}


def _checkout(user_id: str, **obj: Any) -> dict[str, Any]:
    return {
        "id": "evt_1",
        "type": "checkout.session.completed",
        "created": 1_000,
        "data": {"object": {**CHECKOUT, "client_reference_id": user_id, **obj}},
    }


async def _send(
    client: httpx.AsyncClient, event_id: str, event_type: str, created: int, **obj: Any
) -> None:
    event = {
        "id": event_id,
        "type": event_type,
        "created": created,
        "data": {"object": {"customer": "cus_123", **obj}},
    }
    payload, sig = stripe_signed(event)
    assert (await client.post("/webhooks/stripe", content=payload, headers=sig)).status_code == 204


async def _subscribe(client: httpx.AsyncClient, headers: dict[str, str]) -> None:
    me = await _me(client, headers)
    payload, sig = stripe_signed(_checkout(me["id"]))
    await client.post("/webhooks/stripe", content=payload, headers=sig)
    assert (await _me(client, headers))["plan"] == "pro"


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
    payload, sig = stripe_signed(_checkout(me["id"]))
    assert (await client.post("/webhooks/stripe", content=payload, headers=sig)).status_code == 204
    assert (await _me(client, headers))["plan"] == "pro"

    portal = await client.post("/v1/billing/portal", headers=headers)
    assert portal.json()["url"].startswith("https://billing.stripe.test/cus_123")

    await _send(client, "evt_2", "customer.subscription.deleted", 2_000, status="canceled")
    assert (await _me(client, headers))["plan"] == "free"


async def test_replayed_events_are_applied_once(client: httpx.AsyncClient, login: Login) -> None:
    headers = login("buyer")
    me = await _me(client, headers)
    payload, sig = stripe_signed(_checkout(me["id"]))
    await client.post("/webhooks/stripe", content=payload, headers=sig)
    await _send(client, "evt_2", "customer.subscription.updated", 2_000, status="unpaid")
    assert (await client.post("/webhooks/stripe", content=payload, headers=sig)).status_code == 204
    assert (await _me(client, headers))["plan"] == "free"


async def test_a_late_retry_cannot_undo_a_cancellation(
    client: httpx.AsyncClient, login: Login
) -> None:
    headers = login("buyer")
    await _subscribe(client, headers)
    await _send(client, "evt_3", "customer.subscription.deleted", 3_000, status="canceled")
    await _send(client, "evt_2", "customer.subscription.updated", 2_000, status="active")
    assert (await _me(client, headers))["plan"] == "free"


async def test_a_late_retry_cannot_drop_a_paying_user(
    client: httpx.AsyncClient, login: Login
) -> None:
    headers = login("buyer")
    await _subscribe(client, headers)
    await _send(client, "evt_3", "customer.subscription.updated", 3_000, status="active")
    await _send(client, "evt_2", "customer.subscription.updated", 2_000, status="past_due")
    await _send(client, "evt_1b", "customer.subscription.updated", 1_500, status="unpaid")
    assert (await _me(client, headers))["plan"] == "pro"


async def test_subscription_events_before_checkout_do_not_lock_a_buyer_out(
    client: httpx.AsyncClient, login: Login
) -> None:
    headers = login("buyer")
    me = await _me(client, headers)
    await _send(client, "evt_2", "customer.subscription.created", 2_000, status="active")
    payload, sig = stripe_signed(_checkout(me["id"]))
    await client.post("/webhooks/stripe", content=payload, headers=sig)
    assert (await _me(client, headers))["plan"] == "pro"
    await _send(client, "evt_3", "customer.subscription.deleted", 3_000, status="canceled")
    assert (await _me(client, headers))["plan"] == "free"


async def test_events_landing_at_once_settle_on_the_newest(
    client: httpx.AsyncClient, login: Login
) -> None:
    headers = login("buyer")
    await _subscribe(client, headers)
    for _ in range(5):
        await asyncio.gather(
            _send(
                client,
                f"evt_{uuid.uuid4()}",
                "customer.subscription.updated",
                2_000,
                status="active",
            ),
            _send(
                client,
                f"evt_{uuid.uuid4()}",
                "customer.subscription.deleted",
                3_000,
                status="canceled",
            ),
        )
        assert (await _me(client, headers))["plan"] == "free"


async def test_checkout_grants_nothing_until_it_is_paid(
    client: httpx.AsyncClient, login: Login
) -> None:
    headers = login("buyer")
    me = await _me(client, headers)
    payload, sig = stripe_signed(_checkout(me["id"], payment_status="unpaid"))
    assert (await client.post("/webhooks/stripe", content=payload, headers=sig)).status_code == 204
    assert (await _me(client, headers))["plan"] == "free"


async def test_a_bank_debit_grants_pro_once_it_clears(
    client: httpx.AsyncClient, login: Login
) -> None:
    headers = login("buyer")
    me = await _me(client, headers)
    payload, sig = stripe_signed(_checkout(me["id"], payment_status="unpaid"))
    await client.post("/webhooks/stripe", content=payload, headers=sig)
    assert (await client.post("/v1/billing/portal", headers=headers)).status_code == 200
    await _send(
        client,
        "evt_2",
        "checkout.session.async_payment_succeeded",
        1_500,
        client_reference_id=me["id"],
        payment_status="paid",
    )
    assert (await _me(client, headers))["plan"] == "pro"


async def test_an_unpaid_checkout_still_links_the_subscription_that_follows(
    client: httpx.AsyncClient, login: Login
) -> None:
    headers = login("buyer")
    me = await _me(client, headers)
    payload, sig = stripe_signed(_checkout(me["id"], payment_status="unpaid"))
    await client.post("/webhooks/stripe", content=payload, headers=sig)
    await _send(client, "evt_2", "customer.subscription.updated", 2_000, status="active")
    assert (await _me(client, headers))["plan"] == "pro"


async def test_a_cancellation_that_lands_before_its_checkout_still_counts(
    client: httpx.AsyncClient, login: Login
) -> None:
    headers = login("buyer")
    me = await _me(client, headers)
    await _send(client, "evt_2", "customer.subscription.deleted", 2_000, status="canceled")
    payload, sig = stripe_signed(_checkout(me["id"]))
    await client.post("/webhooks/stripe", content=payload, headers=sig)
    assert (await _me(client, headers))["plan"] == "free"


async def test_changes_within_the_same_second_apply_in_the_order_they_arrive(
    client: httpx.AsyncClient, login: Login
) -> None:
    headers = login("buyer")
    await _subscribe(client, headers)
    await _send(client, "evt_2", "customer.subscription.updated", 1_000, status="unpaid")
    assert (await _me(client, headers))["plan"] == "free"
    await _send(client, "evt_3", "customer.subscription.updated", 1_000, status="active")
    assert (await _me(client, headers))["plan"] == "pro"


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


async def test_a_clerk_profile_change_keeps_the_name_chosen_here(
    client: httpx.AsyncClient, login: Login
) -> None:
    me = login("renamed")
    await client.patch("/v1/me", json={"name": "Chosen"}, headers=me)
    updated = {
        "type": "user.updated",
        "data": {
            "id": "renamed",
            "first_name": "Clerk",
            "last_name": "Name",
            "primary_email_address_id": "e1",
            "email_addresses": [{"id": "e1", "email_address": "new@example.com"}],
        },
    }
    payload, headers = clerk_signed(updated)
    await client.post("/webhooks/clerk", content=payload, headers=headers)
    profile = (await client.get("/v1/me", headers=me)).json()
    assert (profile["name"], profile["email"]) == ("Chosen", "new@example.com")


async def test_unsigned_clerk_events_are_rejected(client: httpx.AsyncClient) -> None:
    payload = json.dumps({"type": "user.deleted", "data": {"id": "x"}}).encode()
    response = await client.post("/webhooks/clerk", content=payload, headers={"svix-id": "m"})
    assert response.status_code == 400


@pytest.mark.parametrize(("path", "variable"), [("stripe", "STRIPE"), ("clerk", "CLERK")])
async def test_webhooks_without_a_secret_refuse_everything(
    client: httpx.AsyncClient, settings_override: OverrideSettings, path: str, variable: str
) -> None:
    settings_override(**{f"{variable}_WEBHOOK_SECRET": ""})
    payload, sig = stripe_signed({"id": "evt_y", "type": "x", "data": {"object": {}}}, secret="")
    response = await client.post(f"/webhooks/{path}", content=payload, headers=sig)
    assert response.status_code == 503
    assert response.json()["code"] == "webhooks_off"
