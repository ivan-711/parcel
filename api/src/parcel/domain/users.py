import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from parcel.adapters.clerk import Identity
from parcel.db.models import User


async def provision(session: AsyncSession, identity: Identity) -> User:
    """The user for a Clerk identity, created on first sight.

    Users are keyed on Clerk's id, never matched by email, so someone who signs
    up with another person's address can't inherit their account.
    """
    user = await session.scalar(select(User).where(User.clerk_id == identity.clerk_id))
    if user is None:
        await session.execute(
            insert(User)
            .values(clerk_id=identity.clerk_id, email=identity.email, name=identity.name)
            .on_conflict_do_nothing(index_elements=[User.clerk_id])
        )
        user = await session.scalar(select(User).where(User.clerk_id == identity.clerk_id))
        assert user is not None
        return user
    if identity.email and user.email != identity.email:
        user.email = identity.email
    if identity.name and user.name != identity.name:
        user.name = identity.name
    return user


async def get_active(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    user = await session.get(User, user_id)
    if user is None:
        return None
    if user.demo_expires_at is not None and user.demo_expires_at < datetime.now(UTC):
        return None
    return user
