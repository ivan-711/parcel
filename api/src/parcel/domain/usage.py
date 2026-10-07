from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def take(
    session: AsyncSession, bucket: str, period: date, limit: int, amount: int = 1
) -> bool:
    """Spend `amount` units of a rationed allowance. False, and nothing spent, if that's too many.

    The check and the increment are one statement, so two requests racing for
    the last units can't both get them.
    """
    if amount > limit:
        return False
    row = await session.execute(
        text(
            "insert into usage (bucket, period, count) values (:bucket, :period, :amount) "
            "on conflict (bucket, period) do update set count = usage.count + :amount "
            "where usage.count + :amount <= :limit returning count"
        ),
        {"bucket": bucket, "period": period, "limit": limit, "amount": amount},
    )
    return row.first() is not None
