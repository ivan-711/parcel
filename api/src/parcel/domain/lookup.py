"""Turn an address into suggested inputs, each labeled with where it came from.

Census and FRED are free and cached. RentCast is rationed: one lookup costs
two calls, so every answer is cached for 30 days and spending is capped per
user per day and in total per month. When the budget runs out the lookup still
works, with rent from HUD's Fair Market Rent and no value estimate.
"""

import dataclasses
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from parcel.adapters.property_data import (
    Comparable,
    Estimate,
    Facts,
    Place,
    PropertyData,
    ProviderError,
)
from parcel.db.models import ProviderCache
from parcel.domain import usage
from parcel.errors import Problem
from parcel.schemas import lookup as schema

INSURANCE_RATE = 0.005
"""A rough annual premium as a share of value, used only when nothing better exists."""
INVESTOR_RATE_PREMIUM = 0.005
"""Investment property loans usually price above the owner-occupied average FRED reports."""
WIDE_RANGE = 0.25

_namespace: ContextVar[str] = ContextVar("lookup_namespace", default="")
"""Demo lookups answer from recorded samples, which must never pose as live data."""


@dataclasses.dataclass(frozen=True)
class Budget:
    user_key: str
    per_user_per_day: int
    per_month: int


def _encode(value: Any) -> Any:
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {f.name: _encode(getattr(value, f.name)) for f in dataclasses.fields(value)}
    if isinstance(value, (list, tuple)):
        return [_encode(v) for v in value]
    if isinstance(value, date):
        return value.isoformat()
    return value


def _place(raw: Any) -> Place | None:
    return None if raw is None else Place(**raw)


def _estimate(raw: Any) -> Estimate:
    return Estimate(
        value=raw["value"],
        low=raw["low"],
        high=raw["high"],
        place=Place(**raw["place"]),
        facts=Facts(**raw["facts"]),
        comparables=[Comparable(**c) for c in raw["comparables"]],
    )


def _yearly(raw: Any) -> tuple[float, int] | None:
    return None if raw is None else (float(raw[0]), int(raw[1]))


def _dated(raw: Any) -> tuple[float, date] | None:
    return None if raw is None else (float(raw[0]), date.fromisoformat(raw[1]))


async def _cached[T](
    session: AsyncSession,
    key: str,
    ttl: timedelta,
    decode: Callable[[Any], T],
    fetch: Callable[[], Awaitable[T]],
) -> T:
    key = _namespace.get() + key
    now = datetime.now(UTC)
    hit = await session.scalar(
        select(ProviderCache).where(ProviderCache.key == key, ProviderCache.expires_at > now)
    )
    if hit is not None:
        return decode(hit.payload["value"])
    value = await fetch()
    payload = {"value": _encode(value)}
    await session.execute(
        insert(ProviderCache)
        .values(key=key, payload=payload, expires_at=now + ttl)
        .on_conflict_do_update(
            index_elements=[ProviderCache.key],
            set_={"payload": payload, "expires_at": now + ttl, "fetched_at": now},
        )
    )
    return value


async def autocomplete(
    session: AsyncSession, data: PropertyData, text: str, user_key: str, per_day: int
) -> list[Place]:
    """Places matching a partial address. Each distinct query is cached for a
    day and each user gets a daily allowance, so a script can't drain the
    provider's quota for everyone."""
    key = f"autocomplete:{' '.join(text.lower().split())}"
    now = datetime.now(UTC)
    hit = await session.scalar(
        select(ProviderCache).where(ProviderCache.key == key, ProviderCache.expires_at > now)
    )
    if hit is not None:
        return [Place(**p) for p in hit.payload["value"]]
    if not await usage.take(session, user_key, date.today(), per_day):
        raise Problem(429, "autocomplete_limit", "You've used today's address suggestions.")
    return await _cached(session, key, timedelta(days=1), _places, lambda: data.autocomplete(text))


def _places(raw: Any) -> list[Place]:
    return [Place(**p) for p in raw]


async def _safe[T](pending: Awaitable[T]) -> T | None:
    try:
        return await pending
    except ProviderError:
        return None


async def lookup(
    session: AsyncSession,
    data: PropertyData,
    address: str,
    budget: Budget,
    *,
    sample_data: bool = False,
) -> schema.LookupResult:
    _namespace.set("sample:" if sample_data else "")
    place = await _cached(
        session,
        f"census:{address.upper()}",
        timedelta(days=365),
        _place,
        lambda: data.geocode(address),
    )
    if place is None:
        raise Problem(
            404, "address_not_found", "We couldn't find that address. Check the spelling."
        )

    notes = (
        ["Demo lookups use recorded sample figures, not live market data."] if sample_data else []
    )
    rent, value = await _rentcast(session, data, place, budget, notes)
    if rent is not None:
        place = rent.place
    facts = rent.facts if rent else Facts()

    suggestions: dict[str, schema.Suggestion] = {}
    if value is not None:
        suggestions["price"] = _from_estimate(value, "RentCast value estimate")
        if (value.high - value.low) / value.value > WIDE_RANGE:
            notes.append(
                "The value estimate has a wide range, so nearby sales disagree. "
                "Lean on your own comps for price and ARV."
            )
        suggestions["operations.insurance_annual"] = _suggestion(
            value.value * INSURANCE_RATE,
            "estimate",
            "Rough guess at 0.5% of value a year. Get a quote.",
        )
        tax = await _county_tax(session, data, place, value.value)
        if tax is not None:
            suggestions["operations.property_tax_annual"] = tax
    if rent is not None:
        suggestions["operations.monthly_rent"] = _from_estimate(rent, "RentCast rent estimate")
    else:
        hud = await _hud_rent(session, data, place, int(facts.bedrooms or 3))
        if hud is not None:
            suggestions["operations.monthly_rent"] = hud
    mortgage = await _mortgage_rate(session, data)
    if mortgage is not None:
        suggestions["interest_rate"] = mortgage

    return schema.LookupResult(
        address=schema.AddressOut(
            line1=place.line1,
            city=place.city,
            state=place.state,
            zip=place.zip,
            county=place.county,
            latitude=place.latitude,
            longitude=place.longitude,
        ),
        facts=schema.FactsOut(**dataclasses.asdict(facts)),
        suggestions=suggestions,
        rent_comparables=[_comp(c) for c in (rent.comparables if rent else [])],
        sale_comparables=[_comp(c) for c in (value.comparables if value else [])],
        notes=notes,
    )


async def _rentcast(
    session: AsyncSession, data: PropertyData, place: Place, budget: Budget, notes: list[str]
) -> tuple[Estimate | None, Estimate | None]:
    rent_key, value_key = f"rentcast:rent:{place.key}", f"rentcast:value:{place.key}"
    now = datetime.now(UTC)
    fresh = await session.scalars(
        select(ProviderCache.key).where(
            ProviderCache.key.in_([rent_key, value_key]), ProviderCache.expires_at > now
        )
    )
    if len(list(fresh)) < 2:
        today = date.today()
        if not await usage.take(session, budget.user_key, today, budget.per_user_per_day):
            notes.append("You've used today's address lookups. Rent comes from HUD instead.")
            return None, None
        month = today.replace(day=1)
        if not await usage.take(session, "rentcast:month", month, budget.per_month, amount=2):
            notes.append("This month's market data budget is used up. Rent comes from HUD instead.")
            return None, None
    try:
        rent = await _cached(
            session, rent_key, timedelta(days=30), _estimate, lambda: data.rent_estimate(place)
        )
        value = await _cached(
            session, value_key, timedelta(days=30), _estimate, lambda: data.value_estimate(place)
        )
    except ProviderError:
        notes.append("Market data didn't come back for this address. Rent comes from HUD instead.")
        return None, None
    return rent, value


async def _county_tax(
    session: AsyncSession, data: PropertyData, place: Place, value: float
) -> schema.Suggestion | None:
    state, county = place.state_fips, place.county_fips
    if not (state and county):
        return None
    found = await _safe(
        _cached(
            session,
            f"acs:{state}{county}",
            timedelta(days=365),
            _yearly,
            lambda: data.county_tax_rate(state, county),
        )
    )
    if found is None:
        return None
    rate, year = found
    label = f"County median tax rate of {rate:.2%} (Census ACS {year}) times value"
    return _suggestion(value * rate, "census", label)


async def _hud_rent(
    session: AsyncSession, data: PropertyData, place: Place, bedrooms: int
) -> schema.Suggestion | None:
    found = await _safe(
        _cached(
            session,
            f"hud:{place.state_fips}{place.county_fips}:{place.zip}:{bedrooms}",
            timedelta(days=180),
            _yearly,
            lambda: data.fair_market_rent(place, bedrooms),
        )
    )
    if found is None:
        return None
    rent, year = found
    return _suggestion(rent, "hud", f"HUD Fair Market Rent, FY{year}, {bedrooms} bedrooms")


async def _mortgage_rate(session: AsyncSession, data: PropertyData) -> schema.Suggestion | None:
    found = await _safe(
        _cached(session, "fred:MORTGAGE30US", timedelta(days=1), _dated, data.mortgage_rate)
    )
    if found is None:
        return None
    average, as_of = found
    label = f"Freddie Mac 30-year average of {average:.2%} plus 0.5% for an investment loan"
    return schema.Suggestion(
        value=round(average + INVESTOR_RATE_PREMIUM, 4),
        source=schema.SourceOut(kind="fred", label=label, as_of=as_of),
    )


def _suggestion(value: float, kind: schema.SourceKind, label: str) -> schema.Suggestion:
    return schema.Suggestion(value=round(value), source=schema.SourceOut(kind=kind, label=label))


def _from_estimate(e: Estimate, label: str) -> schema.Suggestion:
    return schema.Suggestion(
        value=round(e.value),
        low=round(e.low),
        high=round(e.high),
        source=schema.SourceOut(kind="rentcast", label=label, as_of=date.today()),
    )


def _comp(c: Comparable) -> schema.ComparableOut:
    return schema.ComparableOut(**dataclasses.asdict(c))
