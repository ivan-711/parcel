import math

import numpy as np
from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool

from parcel.domain.analysis import analyze
from parcel.engine import analysis as engine
from parcel.errors import Problem
from parcel.http.auth import CurrentPrincipal
from parcel.schemas import inputs
from parcel.schemas import tools as schema
from parcel.schemas.analysis import Analysis

router = APIRouter(prefix="/v1/analyze", tags=["analysis"])


def _finite(x: float) -> float | None:
    return x if math.isfinite(x) else None


@router.post("")
async def run_analysis(data: schema.AnalyzeRequest, _: CurrentPrincipal) -> schema.AnalyzeResult:
    return analyze(data.inputs, monthly=data.monthly)


def _bounds(current: float, field: str) -> tuple[float, float]:
    if field.endswith("_rate") or field == "refi_ltv":
        return 0.0, 0.99
    return 1.0, max(current * 5, 10_000.0)


@router.post("/solve")
async def solve(data: schema.SolveRequest, _: CurrentPrincipal) -> schema.SolveResult:
    strategy = data.inputs.to_engine()
    try:
        current = engine.get(strategy, data.field)
    except AttributeError as e:
        raise Problem(
            422,
            "field_not_in_strategy",
            f"A {data.inputs.strategy} deal has no {data.field} input.",
        ) from e
    if current is None:
        raise Problem(422, "field_not_set", f"Set {data.field} before solving for it.")
    lo, hi = _bounds(float(current), data.field)  # type: ignore[arg-type]
    value = await run_in_threadpool(
        engine.solve,
        strategy,
        data.field,
        metric_name=data.metric,
        target=data.target,
        lo=lo,
        hi=hi,
    )
    if value is None:
        return schema.SolveResult(value=None, analysis=None)
    solved = _with(data.inputs, data.field, value)
    result = analyze(solved)
    assert isinstance(result, Analysis)
    return schema.SolveResult(value=round(value, 2 if hi > 1 else 6), analysis=result)


def _with(spec: inputs.Holding, field: str, value: float) -> inputs.Holding:
    head, _, rest = field.partition(".")
    if rest:
        nested = getattr(spec, head).model_copy(update={rest: value})
        return spec.model_copy(update={head: nested})
    return spec.model_copy(update={head: value})


def _grid_axes(spec: inputs.Holding) -> tuple[str, float, str, float]:
    if isinstance(spec, inputs.Flip):
        return "price", spec.price, "after_repair_value", spec.after_repair_value
    return "price", spec.price, "operations.monthly_rent", spec.operations.monthly_rent


@router.post("/sensitivity")
async def sensitivity(
    data: schema.SensitivityRequest, _: CurrentPrincipal
) -> schema.SensitivityResult:
    strategy = data.inputs.to_engine()
    base, swings = await run_in_threadpool(engine.tornado, strategy, data.metric)
    row_field, row_base, col_field, col_base = _grid_axes(data.inputs)
    steps = np.array([0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15])
    rows, cols = row_base * steps, col_base * steps
    values = engine.grid(
        strategy,
        data.metric,
        row_field=row_field,
        row_values=rows,
        col_field=col_field,
        col_values=cols,
    )
    return schema.SensitivityResult(
        metric=data.metric,
        base=_finite(base),
        swings=[
            schema.Swing(
                field=s.field,
                low_input=s.low_input,
                high_input=s.high_input,
                low_result=_finite(s.low_result),
                high_result=_finite(s.high_result),
            )
            for s in swings
        ],
        grid=schema.Grid(
            row_field=row_field,
            row_values=[round(float(v), 2) for v in rows],
            col_field=col_field,
            col_values=[round(float(v), 2) for v in cols],
            values=[[_finite(float(v)) for v in row] for row in values],
        ),
    )


def _histogram(values: np.ndarray, bins: int = 30) -> schema.Histogram:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return schema.Histogram(edges=[], counts=[])
    low, high = np.percentile(finite, [1, 99])
    counts, edges = np.histogram(
        np.clip(finite, low, high), bins=bins, range=(low, high or low + 1)
    )
    return schema.Histogram(edges=[float(e) for e in edges], counts=[int(c) for c in counts])


@router.post("/simulate")
async def simulate(
    data: schema.SimulateRequest, principal: CurrentPrincipal
) -> schema.SimulateResult:
    if not principal.is_pro:
        raise Problem(402, "pro_required", "Monte Carlo simulation is part of Parcel Pro.")
    sim = await run_in_threadpool(
        engine.simulate, data.inputs.to_engine(), runs=data.runs, seed=data.seed
    )
    return schema.SimulateResult(
        runs=sim.runs,
        probability_of_loss=round(sim.probability_of_loss, 4),
        irr_percentiles={str(k): _finite(v) for k, v in sim.irr_percentiles.items()},
        profit_percentiles={str(k): round(v, 2) for k, v in sim.profit_percentiles.items()},
        irr_histogram=_histogram(sim.irr),
        profit_histogram=_histogram(sim.total_profit),
    )
