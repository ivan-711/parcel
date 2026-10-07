import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from parcel.settings import get_settings


class Database:
    def __init__(self) -> None:
        self._engine: AsyncEngine | None = None
        self._sessions: async_sessionmaker[AsyncSession] | None = None

    @property
    def engine(self) -> AsyncEngine:
        if self._engine is None:
            self._engine = create_async_engine(
                get_settings().database_url, pool_pre_ping=True, pool_size=10
            )
        return self._engine

    @property
    def sessions(self) -> async_sessionmaker[AsyncSession]:
        if self._sessions is None:
            self._sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        return self._sessions

    async def dispose(self) -> None:
        if self._engine is not None:
            await self._engine.dispose()
        self._engine = None
        self._sessions = None

    @asynccontextmanager
    async def as_user(self, user_id: uuid.UUID) -> AsyncIterator[AsyncSession]:
        """A transaction where row-level security limits every query to one user's rows."""
        async with self.sessions.begin() as session:
            await session.execute(text("set local role parcel_app"))
            await session.execute(
                text("select set_config('app.user_id', :id, true)"), {"id": str(user_id)}
            )
            yield session

    @asynccontextmanager
    async def as_system(self) -> AsyncIterator[AsyncSession]:
        """A transaction that may touch every user's rows. For sign-in, webhooks and cleanup."""
        async with self.sessions.begin() as session:
            await session.execute(text("select set_config('app.system', 'on', true)"))
            yield session


db = Database()
