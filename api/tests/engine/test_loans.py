import numpy as np
import numpy_financial as npf
import pytest

from parcel.engine.loans import amortizing, interest_only, payment


def col(x: float) -> np.ndarray:
    return np.array([[x]])


def test_payment_matches_numpy_financial() -> None:
    assert payment(col(300_000), col(0.065 / 12), 360)[0, 0] == pytest.approx(
        -npf.pmt(0.065 / 12, 360, 300_000)
    )


def test_payment_at_zero_rate_is_straight_line() -> None:
    assert payment(col(120_000), col(0.0), 120)[0, 0] == pytest.approx(1_000)


def test_payment_rejects_zero_months() -> None:
    with pytest.raises(ValueError, match="at least one month"):
        payment(col(1), col(0.01), 0)


def test_amortizing_split_matches_numpy_financial() -> None:
    s = amortizing(col(200_000), col(0.07), 360, amort_months=360, retire=360)
    months = np.arange(1, 361)
    assert s.interest[0, 1:] == pytest.approx(-npf.ipmt(0.07 / 12, months, 360, 200_000))
    assert s.principal[0, 1:] == pytest.approx(-npf.ppmt(0.07 / 12, months, 360, 200_000))
    assert s.balance[0, 359] == pytest.approx(s.principal[0, 360])
    assert s.payoff[0, 360] == pytest.approx(0, abs=1e-6)


def test_zero_rate_loan_pays_down_evenly() -> None:
    s = amortizing(col(12_000), col(0.0), 24, amort_months=12, retire=24)
    assert s.principal[0, 1:13] == pytest.approx(np.full(12, 1_000))
    assert s.interest.sum() == 0
    assert s.balance[0, 12] == pytest.approx(0)


def test_interest_only_period_then_amortizes() -> None:
    s = amortizing(col(100_000), col(0.06), 60, amort_months=360, io_months=12, retire=60)
    assert s.principal[0, 1:13].sum() == 0
    assert s.interest[0, 1] == pytest.approx(500)
    assert s.principal[0, 13] == pytest.approx(-npf.ppmt(0.005, 1, 360, 100_000))


def test_balloon_pays_the_remaining_balance() -> None:
    s = amortizing(col(50_000), col(0.05), 120, amort_months=360, retire=60)
    remaining = npf.fv(0.05 / 12, 60, npf.pmt(0.05 / 12, 360, 50_000), 50_000)
    assert s.payoff[0, 60] == pytest.approx(-remaining)
    assert s.balance[0, 60:].sum() == 0
    assert s.interest[0, 61:].sum() == 0


def test_loan_funded_later_carries_nothing_before_it_starts() -> None:
    s = amortizing(col(80_000), col(0.07), 24, amort_months=360, start=6, retire=24)
    assert s.interest[0, :7].sum() == 0
    assert s.interest[0, 7] == pytest.approx(80_000 * 0.07 / 12)
    assert s.balance[0, :6].sum() == 0
    assert s.balance[0, 6] == pytest.approx(80_000)


def test_interest_only_draws_accrue_from_the_month_after() -> None:
    draws = np.zeros((1, 7))
    draws[0, 1:5] = 10_000
    s = interest_only(col(100_000), col(0.12), 6, retire=6, draws=draws)
    assert s.interest[0, 1] == pytest.approx(1_000)
    assert s.interest[0, 2] == pytest.approx(1_100)
    assert s.payoff[0, 6] == pytest.approx(140_000)
