import secrets
import uuid
from datetime import UTC, date, datetime
from typing import Any, Literal

from pydantic import TypeAdapter
from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from parcel.db.models import Actual, Deal, Stage, Strategy
from parcel.domain.analysis import analyze
from parcel.errors import Problem, not_found
from parcel.schemas import deals as schema
from parcel.schemas.analysis import Analysis, WholesaleAnalysis
from parcel.schemas.inputs import Inputs

_inputs = TypeAdapter[Inputs](Inputs)
Sort = Literal["updated", "name", "created"]


def parse_inputs(raw: dict[str, Any]) -> Inputs:
    return _inputs.validate_python(raw)


async def list_deals(
    session: AsyncSession,
    *,
    stage: Stage | None = None,
    strategy: Strategy | None = None,
    query: str | None = None,
    sort: Sort = "updated",
) -> list[Deal]:
    stmt = select(Deal)
    if stage is not None:
        stmt = stmt.where(Deal.stage == stage)
    if strategy is not None:
        stmt = stmt.where(Deal.strategy == strategy)
    if query:
        like = f"%{query.strip()}%"
        stmt = stmt.where(or_(Deal.name.ilike(like), Deal.address["line1"].astext.ilike(like)))
    order = {
        "updated": Deal.updated_at.desc(),
        "name": Deal.name,
        "created": Deal.created_at.desc(),
    }
    result = await session.scalars(stmt.order_by(order[sort], Deal.id))
    return list(result)


async def get(session: AsyncSession, deal_id: uuid.UUID) -> Deal:
    deal = await session.get(Deal, deal_id)
    if deal is None:
        raise not_found("No deal with that id")
    return deal


async def create(session: AsyncSession, owner_id: uuid.UUID, data: schema.DealCreate) -> Deal:
    deal = Deal(
        owner_id=owner_id,
        name=data.name,
        strategy=Strategy(data.inputs.strategy),
        stage=data.stage,
        position=await _next_position(session, data.stage),
        inputs=data.inputs.model_dump(mode="json"),
        address=data.address.model_dump(mode="json") if data.address else {},
        provenance={k: v.model_dump(mode="json") for k, v in data.provenance.items()},
        notes=data.notes,
        acquired_on=date.today() if data.stage is Stage.owned else None,
    )
    session.add(deal)
    await session.flush()
    await session.refresh(deal)
    return deal


async def apply_update(session: AsyncSession, deal: Deal, data: schema.DealUpdate) -> Deal:
    changes = data.model_dump(exclude_unset=True)
    if "name" in changes:
        if changes["name"] is None:
            raise Problem(422, "name_required", "A deal needs a name.")
        deal.name = changes["name"]
    if data.inputs is not None:
        deal.inputs = data.inputs.model_dump(mode="json")
        deal.strategy = Strategy(data.inputs.strategy)
    if "address" in changes:
        deal.address = data.address.model_dump(mode="json") if data.address else {}
    if data.provenance is not None:
        deal.provenance = {k: v.model_dump(mode="json") for k, v in data.provenance.items()}
    if "notes" in changes:
        deal.notes = changes["notes"] or ""
    if "acquired_on" in changes:
        deal.acquired_on = changes["acquired_on"]
    deal.updated_at = datetime.now(UTC)
    await session.flush()
    return deal


async def move(session: AsyncSession, deal: Deal, stage: Stage, position: int) -> Deal:
    """Put a deal at `position` in a pipeline column, closing the gap it leaves behind."""
    await session.execute(
        update(Deal)
        .where(Deal.stage == deal.stage, Deal.position > deal.position, Deal.id != deal.id)
        .values(position=Deal.position - 1)
    )
    count = await session.scalar(
        select(func.count()).select_from(Deal).where(Deal.stage == stage, Deal.id != deal.id)
    )
    position = min(position, count or 0)
    await session.execute(
        update(Deal)
        .where(Deal.stage == stage, Deal.position >= position, Deal.id != deal.id)
        .values(position=Deal.position + 1)
    )
    if stage is Stage.owned and deal.acquired_on is None:
        deal.acquired_on = date.today()
    deal.stage = stage
    deal.position = position
    deal.updated_at = datetime.now(UTC)
    await session.flush()
    return deal


async def share(session: AsyncSession, deal: Deal) -> str:
    if deal.share_token is None:
        deal.share_token = secrets.token_urlsafe(32)
        await session.flush()
    return deal.share_token


async def unshare(session: AsyncSession, deal: Deal) -> None:
    deal.share_token = None
    await session.flush()


async def by_share_token(session: AsyncSession, token: str) -> Deal:
    deal = await session.scalar(select(Deal).where(Deal.share_token == token))
    if deal is None:
        raise not_found("This link has been turned off or never existed")
    return deal


async def _next_position(session: AsyncSession, stage: Stage) -> int:
    top = await session.scalar(select(func.max(Deal.position)).where(Deal.stage == stage))
    return 0 if top is None else top + 1


def analysis_of(deal: Deal, *, monthly: bool = False) -> Analysis | WholesaleAnalysis:
    return analyze(parse_inputs(deal.inputs), monthly=monthly)


def summarize(result: Analysis | WholesaleAnalysis) -> schema.Summary:
    target = result.buyer if isinstance(result, WholesaleAnalysis) else result
    m = target.metrics
    if isinstance(result, WholesaleAnalysis):
        return schema.Summary(
            irr=None,
            monthly_cash_flow=None,
            cash_on_cash=None,
            cap_rate=None,
            total_profit=result.assignment_fee or 0.0,
            cash_to_close=result.earnest_money,
            flags=len(result.flags),
        )
    return schema.Summary(
        irr=m.irr,
        monthly_cash_flow=None if m.cash_flow is None else round(m.cash_flow / 12, 2),
        cash_on_cash=m.cash_on_cash,
        cap_rate=m.cap_rate,
        total_profit=m.total_profit,
        cash_to_close=m.cash_to_close,
        flags=sum(1 for f in result.flags if f.severity != "info"),
    )


def to_out(deal: Deal, result: Analysis | WholesaleAnalysis | None = None) -> schema.DealOut:
    result = result or analysis_of(deal)
    return schema.DealOut(
        id=deal.id,
        name=deal.name,
        strategy=deal.strategy,
        stage=deal.stage,
        position=deal.position,
        address=schema.Address(**deal.address) if deal.address else None,
        inputs=parse_inputs(deal.inputs),
        provenance={k: schema.Source(**v) for k, v in deal.provenance.items()},
        notes=deal.notes,
        shared=deal.share_token is not None,
        acquired_on=deal.acquired_on,
        created_at=deal.created_at,
        updated_at=deal.updated_at,
        summary=summarize(result),
    )


def to_detail(deal: Deal, *, monthly: bool = False) -> schema.DealDetail:
    result = analysis_of(deal, monthly=monthly)
    return schema.DealDetail(**to_out(deal, result).model_dump(), analysis=result)


async def put_actual(
    session: AsyncSession, deal: Deal, month: date, data: schema.ActualIn
) -> Actual:
    values = data.model_dump()
    stmt = (
        insert(Actual)
        .values(deal_id=deal.id, owner_id=deal.owner_id, month=month.replace(day=1), **values)
        .on_conflict_do_update(index_elements=[Actual.deal_id, Actual.month], set_=values)
        .returning(Actual)
    )
    result = await session.scalars(stmt, execution_options={"populate_existing": True})
    return result.one()


async def delete_actual(session: AsyncSession, deal: Deal, month: date) -> None:
    actual = await session.scalar(
        select(Actual).where(Actual.deal_id == deal.id, Actual.month == month.replace(day=1))
    )
    if actual is None:
        raise not_found("No numbers recorded for that month")
    await session.delete(actual)


def _months_between(start: date, end: date) -> int:
    return (end.year - start.year) * 12 + end.month - start.month


async def portfolio(session: AsyncSession, today: date | None = None) -> schema.Portfolio:
    today = today or date.today()
    owned = await session.scalars(
        select(Deal)
        .where(Deal.stage == Stage.owned)
        .options(selectinload(Deal.actuals))
        .order_by(Deal.acquired_on, Deal.name)
    )
    properties = []
    current = []
    for deal in owned:
        result = analysis_of(deal, monthly=True)
        if isinstance(result, WholesaleAnalysis) or result.months is None:
            continue
        acquired = deal.acquired_on or today
        actuals = {a.month: a for a in deal.actuals}
        elapsed = min(_months_between(acquired, today), result.horizon_months)
        months = []
        for i in range(1, elapsed + 1):
            month = _add_months(acquired.replace(day=1), i)
            actual = actuals.get(month)
            months.append(
                schema.PortfolioMonth(
                    month=month,
                    projected_cash_flow=result.months[i].operating_cash_flow,
                    actual_cash_flow=None if actual is None else _net(actual),
                    actual=None
                    if actual is None
                    else schema.ActualIn.model_validate(actual, from_attributes=True),
                )
            )
        # The plan ends with the sale, so a property past its hold has nothing
        # left to project. Bought this month, no month has closed yet, so
        # quote the plan's first.
        if elapsed < result.horizon_months:
            current.append(
                months[-1].projected_cash_flow if months else result.months[1].operating_cash_flow
            )
        recorded = [m for m in months if m.actual_cash_flow is not None]
        projected = round(sum(m.projected_cash_flow for m in recorded), 2)
        actual_sum = round(sum(m.actual_cash_flow or 0 for m in recorded), 2)
        properties.append(
            schema.PortfolioProperty(
                deal=to_out(deal, result),
                months=months,
                projected_to_date=projected,
                actual_to_date=actual_sum,
                variance_to_date=round(actual_sum - projected, 2),
            )
        )
    projected = round(sum(p.projected_to_date for p in properties), 2)
    actual_sum = round(sum(p.actual_to_date for p in properties), 2)
    variance = round(actual_sum - projected, 2)
    return schema.Portfolio(
        properties=properties,
        projected_to_date=projected,
        actual_to_date=actual_sum,
        variance_to_date=variance,
        variance_rate=None if projected == 0 else round(variance / abs(projected), 4),
        monthly_projected_now=round(sum(current), 2),
    )


def _net(actual: Actual) -> float:
    return round(
        actual.rent_collected
        - actual.operating_expenses
        - actual.debt_service
        - actual.capital_spent,
        2,
    )


def _add_months(d: date, months: int) -> date:
    total = d.month - 1 + months
    return date(d.year + total // 12, total % 12 + 1, 1)
