import json

import stripe
import structlog
from fastapi import APIRouter, Request, Response
from pydantic import BaseModel
from sqlalchemy import delete, func, update
from svix.webhooks import Webhook, WebhookVerificationError

from parcel.adapters.billing import Billing
from parcel.db.models import User
from parcel.db.session import db
from parcel.domain import billing
from parcel.errors import Problem
from parcel.http.auth import CurrentPrincipal
from parcel.settings import get_settings

log = structlog.get_logger()
router = APIRouter(prefix="/v1/billing", tags=["billing"])
webhooks = APIRouter(prefix="/webhooks", include_in_schema=False)


class Redirect(BaseModel):
    url: str


def _billing(request: Request) -> Billing:
    found: Billing | None = request.app.state.billing
    if found is None:
        raise Problem(503, "billing_off", "Billing isn't set up on this server.")
    return found


def _return_to() -> str:
    return f"{get_settings().web_origins[0]}/settings"


@router.post("/checkout")
async def checkout(request: Request, principal: CurrentPrincipal) -> Redirect:
    if principal.is_demo:
        raise Problem(403, "demo_account", "Sign up to subscribe. The demo already includes Pro.")
    async with db.as_system() as session:
        customer, email = await billing.customer_of(session, principal.user_id)
    url = await _billing(request).checkout_url(
        user_id=str(principal.user_id), email=email, customer_id=customer, return_to=_return_to()
    )
    return Redirect(url=url)


@router.post("/portal")
async def portal(request: Request, principal: CurrentPrincipal) -> Redirect:
    async with db.as_system() as session:
        customer, _ = await billing.customer_of(session, principal.user_id)
    if customer is None:
        raise Problem(409, "no_subscription", "There's no subscription to manage yet.")
    return Redirect(
        url=await _billing(request).portal_url(customer_id=customer, return_to=_return_to())
    )


@webhooks.post("/stripe")
async def stripe_webhook(request: Request) -> Response:
    payload = await request.body()
    secret = get_settings().stripe_webhook_secret.get_secret_value()
    if not secret:
        raise Problem(503, "webhooks_off", "Stripe webhooks aren't configured.")
    try:
        stripe.WebhookSignature.verify_header(
            payload.decode(), request.headers.get("stripe-signature", ""), secret, tolerance=300
        )
    except (stripe.SignatureVerificationError, ValueError) as e:
        raise Problem(400, "bad_signature", "Signature check failed.") from e
    event = json.loads(payload)
    async with db.as_system() as session:
        if await billing.first_delivery(session, event):
            await billing.apply(session, event["type"], event["data"]["object"])
            log.info("stripe_event", type=event["type"], id=event["id"])
    return Response(status_code=204)


@webhooks.post("/clerk")
async def clerk_webhook(request: Request) -> Response:
    payload = await request.body()
    secret = get_settings().clerk_webhook_secret.get_secret_value()
    if not secret:
        raise Problem(503, "webhooks_off", "Clerk webhooks aren't configured.")
    try:
        Webhook(secret).verify(payload, dict(request.headers))
    except WebhookVerificationError as e:
        raise Problem(400, "bad_signature", "Signature check failed.") from e
    event = json.loads(payload)
    data = event.get("data", {})
    async with db.as_system() as session:
        if event.get("type") == "user.deleted" and data.get("id"):
            await session.execute(delete(User).where(User.clerk_id == data["id"]))
        elif event.get("type") == "user.updated":
            emails = {e["id"]: e["email_address"] for e in data.get("email_addresses", [])}
            name = " ".join(p for p in (data.get("first_name"), data.get("last_name")) if p) or None
            await session.execute(
                update(User)
                .where(User.clerk_id == data.get("id"))
                .values(
                    email=emails.get(data.get("primary_email_address_id")),
                    name=func.coalesce(User.name, name),
                )
            )
    return Response(status_code=204)
