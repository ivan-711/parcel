"""Keep each user's plan in step with Stripe.

Stripe can deliver an event more than once, in any order, and two at once.
Event ids are recorded so a repeat is dropped, and every plan change is a
conditional update against the timestamp of the last event applied to that
user, so an older event can't overwrite a newer one no matter when it lands.
Plan changes read the subscription's current status, never the event type.
"""

import uuid
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from parcel.db.models import Plan, StripeEvent, User

ACTIVE = {"active", "trialing", "past_due"}
"""Past due keeps Pro while Stripe retries the card; it drops to free if retries fail."""

PAID = {"paid", "no_payment_required"}


async def first_delivery(session: AsyncSession, event: dict[str, Any]) -> bool:
    inserted = await session.execute(
        insert(StripeEvent)
        .values(
            id=event["id"],
            type=event["type"],
            customer=event["data"]["object"].get("customer"),
            created=int(event.get("created") or 0),
        )
        .on_conflict_do_nothing(index_elements=[StripeEvent.id])
        .returning(StripeEvent.id)
    )
    return inserted.first() is not None


async def apply(session: AsyncSession, event: dict[str, Any]) -> None:
    event_type = event["type"]
    obj = event["data"]["object"]
    created = int(event.get("created") or 0)
    if event_type == "checkout.session.completed":
        user_id = obj.get("client_reference_id")
        customer = obj.get("customer")
        if user_id and customer and obj.get("payment_status") in PAID:
            await session.execute(
                update(User)
                .where(User.id == uuid.UUID(user_id), User.stripe_event_created < created)
                .values(stripe_customer_id=customer, plan=Plan.pro, stripe_event_created=created)
            )
    elif event_type in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        plan = Plan.pro if obj.get("status") in ACTIVE else Plan.free
        if event_type == "customer.subscription.deleted":
            plan = Plan.free
        await session.execute(
            update(User)
            .where(
                User.stripe_customer_id == obj.get("customer"),
                User.stripe_event_created < created,
            )
            .values(plan=plan, stripe_event_created=created)
        )


async def customer_of(session: AsyncSession, user_id: uuid.UUID) -> tuple[str | None, str | None]:
    row = (
        await session.execute(select(User.stripe_customer_id, User.email).where(User.id == user_id))
    ).one()
    return row[0], row[1]
