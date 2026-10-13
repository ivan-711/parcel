"""Keep each user's plan in step with Stripe.

Stripe can deliver an event more than once, in any order, and two at once.
Event ids are recorded so a repeat is dropped, and every plan change is a
conditional update against the timestamp of the last event applied to that
user, so an older event can't overwrite a newer one no matter when it lands.
Plan changes read the subscription's current status, never the event type.
"""

import uuid
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from parcel.db.models import Plan, StripeEvent, User

ACTIVE = {"active", "trialing", "past_due"}
"""Past due keeps Pro while Stripe retries the card; it drops to free if retries fail."""

PAID = {"paid", "no_payment_required"}

CHECKOUT = {"checkout.session.completed", "checkout.session.async_payment_succeeded"}
SUBSCRIPTION = {
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
}


async def first_delivery(session: AsyncSession, event: dict[str, Any]) -> bool:
    obj = event["data"]["object"]
    inserted = await session.execute(
        insert(StripeEvent)
        .values(
            id=event["id"],
            type=event["type"],
            customer=obj.get("customer"),
            created=int(event.get("created") or 0),
            subscription_status=obj.get("status") if event["type"] in SUBSCRIPTION else None,
        )
        .on_conflict_do_nothing(index_elements=[StripeEvent.id])
        .returning(StripeEvent.id)
    )
    return inserted.first() is not None


def _plan(event_type: str, status: str | None) -> Plan:
    if event_type == "customer.subscription.deleted":
        return Plan.free
    return Plan.pro if status in ACTIVE else Plan.free


async def apply(session: AsyncSession, event: dict[str, Any]) -> None:
    event_type = event["type"]
    obj = event["data"]["object"]
    created = int(event.get("created") or 0)
    customer = obj.get("customer")
    if not customer:
        return
    # One customer's events are applied one at a time, so a checkout sees every subscription
    # event that got here first, and none slips in between its two steps.
    await session.execute(select(func.pg_advisory_xact_lock(func.hashtext(customer))))
    if event_type in CHECKOUT:
        user_id = obj.get("client_reference_id")
        if not user_id:
            return
        # The customer is linked before any payment clears: a bank debit can take days, and
        # the subscription events that follow only know the user by this id.
        await session.execute(
            update(User).where(User.id == uuid.UUID(user_id)).values(stripe_customer_id=customer)
        )
        if obj.get("payment_status") not in PAID:
            return
        plan, created = await _standing(session, customer, created)
        await session.execute(
            update(User)
            .where(User.id == uuid.UUID(user_id), User.stripe_event_created <= created)
            .values(plan=plan, stripe_event_created=created)
        )
    elif event_type in SUBSCRIPTION:
        await session.execute(
            update(User)
            .where(User.stripe_customer_id == customer, User.stripe_event_created <= created)
            .values(plan=_plan(event_type, obj.get("status")), stripe_event_created=created)
        )


async def _standing(session: AsyncSession, customer: str, created: int) -> tuple[Plan, int]:
    """The plan a paid checkout grants. Pro, unless a subscription event from after it
    already arrived and found no user to apply to; then that event has the last word."""
    later = (
        await session.execute(
            select(StripeEvent.type, StripeEvent.subscription_status, StripeEvent.created)
            .where(
                StripeEvent.customer == customer,
                StripeEvent.type.in_(SUBSCRIPTION),
                StripeEvent.created >= created,
            )
            .order_by(StripeEvent.created.desc(), StripeEvent.received_at.desc())
            .limit(1)
        )
    ).first()
    if later is None:
        return Plan.pro, created
    return _plan(later[0], later[1]), int(later[2])


async def customer_of(session: AsyncSession, user_id: uuid.UUID) -> tuple[str | None, str | None]:
    row = (
        await session.execute(select(User.stripe_customer_id, User.email).where(User.id == user_id))
    ).one()
    return row[0], row[1]
