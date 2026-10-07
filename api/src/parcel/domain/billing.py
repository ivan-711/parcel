"""Keep each user's plan in step with Stripe.

Stripe can deliver an event more than once and in any order, so every event
id is recorded before it is applied, and plan changes are read from the
subscription's current status rather than inferred from the event type.
"""

import uuid
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from parcel.db.models import Plan, StripeEvent, User

ACTIVE = {"active", "trialing", "past_due"}
"""Past due keeps Pro while Stripe retries the card; it drops to free if retries fail."""


async def first_delivery(session: AsyncSession, event_id: str, event_type: str) -> bool:
    inserted = await session.execute(
        insert(StripeEvent)
        .values(id=event_id, type=event_type)
        .on_conflict_do_nothing(index_elements=[StripeEvent.id])
        .returning(StripeEvent.id)
    )
    return inserted.first() is not None


async def apply(session: AsyncSession, event_type: str, obj: dict[str, Any]) -> None:
    if event_type == "checkout.session.completed":
        user_id = obj.get("client_reference_id")
        customer = obj.get("customer")
        if user_id and customer:
            await session.execute(
                update(User)
                .where(User.id == uuid.UUID(user_id))
                .values(stripe_customer_id=customer, plan=Plan.pro)
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
            update(User).where(User.stripe_customer_id == obj.get("customer")).values(plan=plan)
        )


async def customer_of(session: AsyncSession, user_id: uuid.UUID) -> tuple[str | None, str | None]:
    row = (
        await session.execute(select(User.stripe_customer_id, User.email).where(User.id == user_id))
    ).one()
    return row[0], row[1]
