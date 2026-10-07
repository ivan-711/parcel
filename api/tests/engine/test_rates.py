import numpy as np
import numpy_financial as npf
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from parcel.engine.rates import annualize, brent, monthly_from_annual, monthly_irr, npv


@settings(max_examples=200, deadline=None)
@given(
    outlay=st.floats(1_000, 1_000_000),
    flows=st.lists(st.floats(-5_000, 50_000), min_size=2, max_size=120),
    exit_value=st.floats(0, 2_000_000),
)
def test_irr_zeroes_npv_and_matches_numpy_financial_when_unique(
    outlay: float, flows: list[float], exit_value: float
) -> None:
    cf = np.array([-outlay, *flows[:-1], flows[-1] + exit_value])
    got = monthly_irr(cf)[0]
    if got > -0.5:
        assert npv(got, cf)[0] == pytest.approx(0, abs=1e-6 * np.abs(cf).sum())
    signs = np.sign(cf[cf != 0])
    expected = npf.irr(cf)
    if np.count_nonzero(np.diff(signs)) == 1 and -0.99 < expected < 1.0:
        assert got == pytest.approx(expected, rel=1e-6, abs=1e-9)


def test_irr_is_nan_when_money_never_comes_back() -> None:
    assert np.isnan(monthly_irr(np.array([-100.0, -10.0, -10.0]))[0])


def test_irr_falls_back_to_bisection_when_newton_stalls() -> None:
    cf = np.array([-1_000.0] + [0.0] * 59 + [1e9])
    rate = monthly_irr(cf)[0]
    assert npv(rate, cf)[0] == pytest.approx(0, abs=1e-3)


def test_irr_handles_many_rows_at_once() -> None:
    flows = np.array([[-100.0, 110.0, 0.0], [-100.0, 50.0, 60.0], [-1.0, -1.0, -1.0]])
    out = monthly_irr(flows)
    assert out[0] == pytest.approx(0.10)
    assert out[1] == pytest.approx(npf.irr([-100, 50, 60]))
    assert np.isnan(out[2])


def test_annualize_round_trips() -> None:
    assert float(annualize(monthly_from_annual(0.12))) == pytest.approx(0.12)


def test_brent_finds_roots() -> None:
    assert brent(lambda x: x**3 - 2 * x - 5, 2, 3) == pytest.approx(2.0945514815, abs=1e-8)
    assert brent(lambda x: x - 1, 0, 1) == 1
    assert brent(lambda x: np.cos(x) - x, 0, 1) == pytest.approx(0.7390851332, abs=1e-8)


def test_brent_needs_a_bracket() -> None:
    with pytest.raises(ValueError, match="not bracketed"):
        brent(lambda x: x**2 + 1, -1, 1)
