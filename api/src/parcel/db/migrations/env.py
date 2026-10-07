import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from parcel.db.models import Base
from parcel.settings import get_settings

if context.config.config_file_name is not None:
    fileConfig(context.config.config_file_name)


def run(connection) -> None:  # type: ignore[no-untyped-def]
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def main() -> None:
    url = context.config.get_main_option("sqlalchemy.url") or get_settings().database_url
    engine = create_async_engine(url)
    async with engine.connect() as connection:
        await connection.run_sync(run)
    await engine.dispose()


if context.is_offline_mode():
    raise SystemExit("offline migrations are not supported")
asyncio.run(main())
