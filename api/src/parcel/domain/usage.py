from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def take(session: AsyncSession, bucket: str, period: date, limit: int) -> bool:
    """Use one unit of a rationed allowance. False when the allowance is spent.

    The check and the increment are a single statement, so two requests racing
    for the last unit can't both get it.
    """
    row = await session.execute(
        text(
            "insert into usage (bucket, period, count) values (:bucket, :period, 1) "
            "on conflict (bucket, period) do update set count = usage.count + 1 "
            "where usage.count < :limit returning count"
        ),
        {"bucket": bucket, "period": period, "limit": limit},
    )
    return row.first() is not None if limit > 0 else False
