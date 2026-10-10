import tracemalloc
from dataclasses import replace

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from parcel.engine.analysis import (
    Driver,
    Uncertainty,
    get,
    grid,
    metric,
    simulate,
    solve,
    tornado,
    with_value,
)
from parcel.engine.strategies import BuyAndHold, Flip


@settings(max_examples=40, deadline=None)
@given(target=st.floats(-0.05, 0.12))
def test_solved_price_hits_the_target(rental: BuyAndHold, target: float) -> None:
    price = solve(
        rental, "price", metric_name="cash_on_cash", target=target, lo=20_000, hi=1_000_000
    )
    if price is None:
        return
    assert metric(replace(rental, price=price), "cash_on_cash") == pytest.approx(target, abs=1e-6)


def test_solve_reports_unreachable_targets(rental: BuyAndHold) -> None:
    assert (
        solve(rental, "price", metric_name="cash_on_cash", target=5.0, lo=100_000, hi=300_000)
        is None
    )


def test_solve_on_a_nested_input(rental: BuyAndHold) -> None:
    rent = solve(
        rental, "operations.monthly_rent", metric_name="dscr", target=1.25, lo=500, hi=10_000
    )
    assert rent is not None
    assert metric(with_value(rental, "operations.monthly_rent", rent), "dscr") == pytest.approx(
        1.25
    )


def test_with_value_rejects_unknown_inputs(rental: BuyAndHold) -> None:
    with pytest.raises(KeyError):
        with_value(rental, "operations.nope", 1.0)
    with pytest.raises(KeyError):
        with_value(rental, "price.cents", 1.0)


def test_get_follows_paths(rental: BuyAndHold) -> None:
    assert get(rental, "operations.monthly_rent") == 2_000


def test_tornado_swings_match_one_at_a_time_runs(rental: BuyAndHold) -> None:
    base, swings = tornado(rental, "irr")
    assert base == pytest.approx(metric(rental, "irr"))
    for s in swings:
        assert s.low_result == pytest.approx(
            metric(with_value(rental, s.field, s.low_input), "irr")
        )
        assert s.high_result == pytest.approx(
            metric(with_value(rental, s.field, s.high_input), "irr")
        )
    widths = [abs(s.high_result - s.low_result) for s in swings]
    assert widths == sorted(widths, reverse=True)


def test_tornado_skips_inputs_the_strategy_lacks_or_leaves_at_zero(rental: BuyAndHold) -> None:
    _, swings = tornado(rental, "irr")
    fields = {s.field for s in swings}
    assert "rehab_cost" not in fields
    assert "after_repair_value" not in fields
    assert "price" in fields


def test_tornado_never_varies_month_counts(rental: BuyAndHold) -> None:
    _, swings = tornado(rental, "irr", (Driver("hold_years", 0.5, 1.5), Driver("price", 0.9, 1.1)))
    assert [s.field for s in swings] == ["price"]


def test_tornado_with_nothing_to_vary(rental: BuyAndHold) -> None:
    base, swings = tornado(rental, "irr", (Driver("rehab_cost", 0.8, 1.2),))
    assert swings == []
    assert base == pytest.approx(metric(rental, "irr"))


def test_grid_cells_match_single_runs(rental: BuyAndHold) -> None:
    prices = np.array([200_000.0, 250_000.0, 300_000.0])
    rents = np.array([1_800.0, 2_200.0])
    out = grid(
        rental,
        "cash_flow",
        row_field="price",
        row_values=prices,
        col_field="operations.monthly_rent",
        col_values=rents,
    )
    assert out.shape == (3, 2)
    single = with_value(replace(rental, price=300_000.0), "operations.monthly_rent", 1_800.0)
    assert out[2, 0] == pytest.approx(metric(single, "cash_flow"))


def test_simulation_is_reproducible_with_a_seed(rental: BuyAndHold) -> None:
    a = simulate(rental, runs=2_000, seed=7)
    b = simulate(rental, runs=2_000, seed=7)
    assert a.probability_of_loss == b.probability_of_loss
    assert a.irr_percentiles == b.irr_percentiles
    assert a.irr_percentiles[10] <= a.irr_percentiles[50] <= a.irr_percentiles[90]


def test_a_long_hold_simulates_in_bounded_memory(rental: BuyAndHold) -> None:
    long = replace(rental, hold_years=40)
    tracemalloc.start()
    sim = simulate(long, runs=4_000, seed=5)
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    assert sim.irr.shape == (4_000,)
    assert peak < 150 * 1024 * 1024


def test_simulation_spread_brackets_the_base_case(rental: BuyAndHold) -> None:
    sim = simulate(rental, runs=5_000, seed=3)
    base = metric(rental, "irr")
    assert sim.irr_percentiles[10] < base < sim.irr_percentiles[90]
    assert 0 <= sim.probability_of_loss <= 1


def test_rehab_overruns_only_push_costs_up(flip: Flip) -> None:
    sim = simulate(
        flip, runs=2_000, seed=1, uncertainty=(Uncertainty("rehab_cost", 0.2, skew_up=True),)
    )
    assert sim.total_profit.max() <= metric(flip, "total_profit") + 1e-6


def test_simulation_when_every_run_loses_everything(flip: Flip) -> None:
    doomed = replace(flip, after_repair_value=10_000.0)
    sim = simulate(doomed, runs=500, seed=2)
    assert sim.probability_of_loss == 1.0
