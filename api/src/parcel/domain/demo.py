"""The sandbox a visitor gets without signing up: a private copy of a few real-looking deals."""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from parcel.db.models import Actual, Deal, Stage, Strategy, User
from parcel.schemas import inputs as i

_SOURCE_NOTE = {"kind": "estimate", "label": "Sample figure for the demo"}


def _ops(rent: float, tax: float, insurance: float, lease_up_months: int = 0) -> i.Operations:
    return i.Operations(
        monthly_rent=rent,
        property_tax_annual=tax,
        insurance_annual=insurance,
        lease_up_months=lease_up_months,
    )


Sample = tuple[
    str, dict[str, str], Stage, i.BuyAndHold | i.Brrrr | i.Flip | i.CreativeFinance | i.Wholesale
]

SAMPLES: list[Sample] = [
    (
        "Duplex on N 14th",
        {"line1": "1420 N 14th St", "city": "Sheboygan", "state": "WI", "zip": "53081"},
        Stage.owned,
        i.BuyAndHold(price=218_000, operations=_ops(2_350, 3_900, 1_650), interest_rate=0.0675),
    ),
    (
        "Ranch BRRRR, Kohler Ave",
        {"line1": "2210 Kohler Ave", "city": "Sheboygan", "state": "WI", "zip": "53081"},
        Stage.under_contract,
        i.Brrrr(
            price=112_000,
            rehab_cost=46_000,
            rehab_months=4,
            after_repair_value=205_000,
            operations=_ops(1_750, 3_100, 1_300, lease_up_months=1),
        ),
    ),
    (
        "Cape Cod flip",
        {"line1": "915 Erie Ave", "city": "Sheboygan", "state": "WI", "zip": "53081"},
        Stage.offer,
        i.Flip(
            price=139_000,
            rehab_cost=38_000,
            after_repair_value=232_000,
            rehab_months=3,
            months_to_sell=2,
            property_tax_annual=2_800,
            insurance_annual=1_400,
            utilities_monthly=180,
            loan_to_cost=0.9,
            rehab_financed=1.0,
        ),
    ),
    (
        "Subject-to fourplex",
        {"line1": "3305 S 12th St", "city": "Sheboygan", "state": "WI", "zip": "53081"},
        Stage.analyzing,
        i.CreativeFinance(
            price=310_000,
            operations=_ops(3_900, 5_600, 2_400),
            existing_balance=205_000,
            existing_rate=0.0325,
            existing_months_left=312,
            cash_to_seller=15_000,
            seller_rate=0.045,
            seller_balloon_years=7,
        ),
    ),
    (
        "Estate sale wholesale",
        {"line1": "1104 Michigan Ave", "city": "Sheboygan", "state": "WI", "zip": "53081"},
        Stage.lead,
        i.Wholesale(
            contract_price=96_000,
            after_repair_value=198_000,
            rehab_cost=42_000,
            property_tax_annual=2_500,
            insurance_annual=1_300,
        ),
    ),
]


async def create_sandbox(session: AsyncSession, expires_at: datetime) -> User:
    user = User(name="Demo investor", demo_expires_at=expires_at)
    session.add(user)
    await session.flush()
    positions: dict[Stage, int] = {}
    for name, address, stage, spec in SAMPLES:
        deal = Deal(
            owner_id=user.id,
            name=name,
            strategy=Strategy(spec.strategy),
            stage=stage,
            position=positions.get(stage, 0),
            address=address,
            inputs=spec.model_dump(mode="json"),
            provenance={"operations.monthly_rent": _SOURCE_NOTE},
            acquired_on=_months_ago(14) if stage is Stage.owned else None,
        )
        positions[stage] = deal.position + 1
        session.add(deal)
        await session.flush()
        if stage is Stage.owned:
            _add_history(session, deal)
    return user


def _months_ago(n: int) -> date:
    today = date.today().replace(day=1)
    total = today.year * 12 + today.month - 1 - n
    return date(total // 12, total % 12 + 1, 1)


def _add_history(session: AsyncSession, deal: Deal) -> None:
    """A year of actuals with a vacant turnover month and a water heater replacement."""
    for n in range(1, 13):
        month = _months_ago(14 - n)
        rent = 0.0 if n == 5 else 2_350.0
        session.add(
            Actual(
                deal_id=deal.id,
                owner_id=deal.owner_id,
                month=month,
                rent_collected=rent,
                operating_expenses=640.0 + (450.0 if n == 5 else 0),
                debt_service=1_060.0,
                capital_spent=1_350.0 if n == 9 else 0.0,
            )
        )


async def remove_expired(session: AsyncSession, now: datetime | None = None) -> int:
    cutoff = now or datetime.now(UTC)
    expired = list(await session.scalars(select(User.id).where(User.demo_expires_at < cutoff)))
    if expired:
        await session.execute(delete(User).where(User.id.in_(expired)))
    return len(expired)


def ttl(hours: int) -> datetime:
    return datetime.now(UTC) + timedelta(hours=hours)
