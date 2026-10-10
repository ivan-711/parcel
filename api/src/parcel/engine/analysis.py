"""Questions asked of a strategy as a whole: what does it return, what would
it take to hit a target, how sensitive is it, and how often does it lose money.

Strategy inputs accept numpy arrays anywhere a dollar amount or rate goes, so
tornado charts, grids and Monte Carlo all evaluate in one vectorized pass.
"""

from dataclasses import dataclass, fields, is_dataclass, replace
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

from parcel.engine.ledger import Ledger, build
from parcel.engine.metrics import Metrics, measure
from parcel.engine.model import Deal
from parcel.engine.rates import brent


class Strategy(Protocol):
    def deal(self) -> Deal: ...


def run(strategy: Strategy, discount_rate: float = 0.10) -> tuple[Ledger, Metrics]:
    ledger = build(strategy.deal())
    return ledger, measure(ledger, discount_rate)


def get(obj: object, path: str) -> object:
    for part in path.split("."):
        obj = getattr(obj, part)
    return obj


def with_value[S](obj: S, path: str, value: object) -> S:
    head, _, rest = path.partition(".")
    if not is_dataclass(obj) or isinstance(obj, type) or head not in {f.name for f in fields(obj)}:
        raise KeyError(f"no input named {path!r}")
    new = with_value(getattr(obj, head), rest, value) if rest else value
    return replace(obj, **{head: new})


def metric(strategy: Strategy, name: str) -> float:
    _, m = run(strategy)
    return float(getattr(m, name)[0])


def solve(
    strategy: Strategy, field: str, *, metric_name: str, target: float, lo: float, hi: float
) -> float | None:
    """The value of `field` between `lo` and `hi` that makes `metric_name` equal `target`.

    Returns None when the target is out of reach anywhere in the range.
    """

    def gap(x: float) -> float:
        value = metric(with_value(strategy, field, x), metric_name)
        return value - target if np.isfinite(value) else np.nan

    g_lo, g_hi = gap(lo), gap(hi)
    if not (np.isfinite(g_lo) and np.isfinite(g_hi)) or g_lo * g_hi > 0:
        return None
    return brent(gap, lo, hi, tol=1e-6 * max(abs(lo), abs(hi), 1.0))


@dataclass(frozen=True)
class Driver:
    field: str
    low: float
    high: float
    relative: bool = True
    """Relative drivers scale the base value (0.9 means 10% lower). Others add to it."""

    def bounds(self, base: float) -> tuple[float, float]:
        if self.relative:
            return base * self.low, base * self.high
        return base + self.low, base + self.high


DEFAULT_DRIVERS = (
    Driver("price", 0.9, 1.1),
    Driver("operations.monthly_rent", 0.9, 1.1),
    Driver("operations.vacancy_rate", -0.03, 0.05, relative=False),
    Driver("rehab_cost", 0.8, 1.3),
    Driver("interest_rate", -0.01, 0.01, relative=False),
    Driver("appreciation", -0.02, 0.01, relative=False),
    Driver("after_repair_value", 0.9, 1.1),
    Driver("operations.property_tax_annual", 0.9, 1.2),
)


@dataclass(frozen=True)
class Swing:
    field: str
    low_input: float
    high_input: float
    low_result: float
    high_result: float


def tornado(
    strategy: Strategy, target_metric: str, drivers: tuple[Driver, ...] = DEFAULT_DRIVERS
) -> tuple[float, list[Swing]]:
    """How far `target_metric` moves when each driver swings on its own.

    Drivers the strategy doesn't have, or that sit at zero, are skipped.
    """
    base = metric(strategy, target_metric)
    usable = [(d, float(v)) for d in drivers if (v := _scalar(strategy, d.field)) is not None]
    usable = [(d, v) for d, v in usable if v != 0 or not d.relative]
    if not usable:
        return base, []
    runs = 2 * len(usable)
    batch = strategy
    lows_highs = []
    for i, (driver, value) in enumerate(usable):
        low, high = driver.bounds(value)
        column = np.full(runs, value)
        column[2 * i], column[2 * i + 1] = low, high
        batch = with_value(batch, driver.field, column)
        lows_highs.append((low, high))
    _, m = run(batch)
    results = getattr(m, target_metric)
    swings = [
        Swing(d.field, lo, hi, float(results[2 * i]), float(results[2 * i + 1]))
        for i, ((d, _), (lo, hi)) in enumerate(zip(usable, lows_highs, strict=True))
    ]
    swings.sort(key=lambda s: -abs(s.high_result - s.low_result))
    return base, swings


def grid(
    strategy: Strategy,
    target_metric: str,
    *,
    row_field: str,
    row_values: NDArray[np.float64],
    col_field: str,
    col_values: NDArray[np.float64],
) -> NDArray[np.float64]:
    rows, cols = np.meshgrid(row_values, col_values, indexing="ij")
    batch = with_value(strategy, row_field, rows.ravel())
    batch = with_value(batch, col_field, cols.ravel())
    _, m = run(batch)
    return np.asarray(getattr(m, target_metric)).reshape(rows.shape)


@dataclass(frozen=True)
class Uncertainty:
    field: str
    spread: float
    relative: bool = True
    """Relative: normal with a standard deviation of `spread` times the base value.
    Otherwise normal with a standard deviation of `spread` in the field's own units."""
    floor: float | None = 0.0
    skew_up: bool = False
    """Rehab overruns run long, not short. Skewed inputs only ever move up."""


DEFAULT_UNCERTAINTY = (
    Uncertainty("operations.monthly_rent", 0.08),
    Uncertainty("operations.vacancy_rate", 0.03, relative=False),
    Uncertainty("operations.expense_growth", 0.01, relative=False, floor=None),
    Uncertainty("rehab_cost", 0.15, skew_up=True),
    Uncertainty("after_repair_value", 0.07),
    Uncertainty("appreciation", 0.02, relative=False, floor=None),
)


_BATCH_CELLS = 120_000


@dataclass(frozen=True)
class Simulation:
    runs: int
    irr: NDArray[np.float64]
    total_profit: NDArray[np.float64]
    probability_of_loss: float
    irr_percentiles: dict[int, float]
    profit_percentiles: dict[int, float]


def simulate(
    strategy: Strategy,
    runs: int = 10_000,
    uncertainty: tuple[Uncertainty, ...] = DEFAULT_UNCERTAINTY,
    seed: int | None = None,
) -> Simulation:
    rng = np.random.default_rng(seed)
    draws: dict[str, NDArray[np.float64]] = {}
    for u in uncertainty:
        base = _scalar(strategy, u.field)
        if base is None or (u.relative and base == 0):
            continue
        scale = abs(base) * u.spread if u.relative else u.spread
        shock = rng.standard_normal(runs) * scale
        if u.skew_up:
            shock = np.abs(shock)
        drawn = base + shock
        if u.floor is not None:
            drawn = np.maximum(drawn, u.floor)
        draws[u.field] = drawn
    # Every ledger line is a runs by months grid, so a long hold with every
    # run at once would take gigabytes. Batches keep each pass to a few MB.
    step = max(250, _BATCH_CELLS // (strategy.deal().horizon + 1))
    profits, irrs = [], []
    for start in range(0, runs, step):
        batch = strategy
        for field, drawn in draws.items():
            batch = with_value(batch, field, drawn[start : start + step])
        _, m = run(batch)
        size = min(step, runs - start)
        profits.append(np.broadcast_to(m.total_profit, (size,)))
        irrs.append(np.broadcast_to(m.irr, (size,)))
    profit = np.concatenate(profits)
    irr = np.concatenate(irrs)
    pct = (10, 50, 90)
    finite = irr[np.isfinite(irr)]
    return Simulation(
        runs=runs,
        irr=irr,
        total_profit=profit,
        probability_of_loss=float((profit < 0).mean()),
        irr_percentiles={
            p: float(np.percentile(finite, p)) if finite.size else float("nan") for p in pct
        },
        profit_percentiles={p: float(np.percentile(profit, p)) for p in pct},
    )


def _scalar(strategy: Strategy, path: str) -> float | None:
    """The field's current value if it is a dollar amount or rate, else None."""
    parent_path, _, name = path.rpartition(".")
    try:
        parent = get(strategy, parent_path) if parent_path else strategy
        value = getattr(parent, name)
    except AttributeError:
        return None
    declared = {f.name: f.type for f in fields(parent)} if is_dataclass(parent) else {}
    if declared.get(name) in (int, int | None) or isinstance(value, bool):
        return None
    if not isinstance(value, (int, float, np.floating)):
        return None
    return float(value)
