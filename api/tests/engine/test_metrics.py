from dataclasses import replace

import numpy as np
import numpy_financial as npf
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from parcel.engine.analysis import run
from parcel.engine.ledger import build
from parcel.engine.metrics import measure
from parcel.engine.model import Deal, Exit, Operations
from parcel.engine.strategies import Brrrr, BuyAndHold, Flip


def test_stabilized_year_by_hand(rental: BuyAndHold) -> None:
    _, m = run(rental)
    debt_service = -npf.pmt(0.07 / 12, 360, 187_500) * 12
    assert m.noi[0] == pytest.approx(22_800 - 3_000 - 1_200 - 1_824 - 1_140)
    assert m.debt_service[0] == pytest.approx(debt_service)
    assert m.cash_flow[0] == pytest.approx(15_636 - 1_140 - debt_service)
    assert m.cap_rate[0] == pytest.approx(15_636 / 250_000)
    assert m.yield_on_cost[0] == pytest.approx(15_636 / 257_500)
    assert m.dscr[0] == pytest.approx(15_636 / debt_service)
    assert m.grm[0] == pytest.approx(250_000 / 24_000)


def test_irr_and_npv_match_numpy_financial(rental: BuyAndHold) -> None:
    led, m = run(rental, discount_rate=0.08)
    cf = led.cash_flow[0]
    assert m.irr[0] == pytest.approx((1 + npf.irr(cf)) ** 12 - 1)
    assert m.npv[0] == pytest.approx(npf.npv(1.08 ** (1 / 12) - 1, cf))
    assert m.equity_multiple[0] == pytest.approx(cf[cf > 0].sum() / -cf[cf < 0].sum())
    assert m.total_profit[0] == pytest.approx(cf.sum())


@settings(max_examples=60, deadline=None)
@given(
    rent=st.floats(1_200, 4_000),
    price=st.floats(120_000, 400_000),
    rate=st.floats(0.03, 0.09),
    other=st.floats(0, 600),
)
def test_break_even_occupancy_really_breaks_even(
    rent: float, price: float, rate: float, other: float
) -> None:
    ops = Operations(
        monthly_rent=rent,
        property_tax_annual=price * 0.012,
        insurance_annual=1_500,
        other_income_monthly=other,
    )
    deal = BuyAndHold(price=price, operations=ops, interest_rate=rate, appreciation=0.0)
    _, m = run(deal)
    beo = float(m.break_even_occupancy[0])
    at_break_even = replace(deal, operations=replace(ops, vacancy_rate=1 - beo))
    _, even = run(at_break_even)
    assert even.cash_flow[0] == pytest.approx(0, abs=1e-6)


def test_other_income_does_not_sit_empty_with_the_units() -> None:
    ops = Operations(
        monthly_rent=2_000,
        property_tax_annual=18_000,
        insurance_annual=0,
        other_income_monthly=1_000,
        vacancy_rate=0,
        management_rate=0,
        maintenance_rate=0,
        capex_rate=0,
        rent_growth=0,
        expense_growth=0,
    )
    _, m = run(BuyAndHold(price=200_000, operations=ops, down_payment_rate=1.0, hold_years=2))
    assert m.break_even_occupancy[0] == pytest.approx(0.25)
    managed = replace(ops, management_rate=0.08)
    _, m = run(BuyAndHold(price=200_000, operations=managed, down_payment_rate=1.0, hold_years=2))
    assert m.break_even_occupancy[0] == pytest.approx((18_000 / 0.92 - 12_000) / 24_000)


def test_a_refinance_that_raises_nothing_still_counts_the_payoff(ops: Operations) -> None:
    deal = Brrrr(
        price=100_000,
        rehab_cost=40_000,
        rehab_months=3,
        after_repair_value=180_000,
        operations=ops,
        refi_ltv=0.0,
    )
    led, m = run(deal)
    assert led.loan_payoffs[0, deal.refi_month] == pytest.approx(125_000)
    assert m.refi_cash_out[0] == pytest.approx(-125_000)


def test_cash_on_cash_counts_every_dollar_in(ops: Operations) -> None:
    deal = BuyAndHold(price=200_000, operations=ops, rehab_cost=15_000, closing_cost_rate=0.03)
    _, m = run(deal)
    assert m.cash_left_in_deal[0] == pytest.approx(50_000 + 6_000 + 15_000)
    assert m.cash_on_cash[0] == pytest.approx(m.cash_flow[0] / 71_000)


def test_no_stabilized_year_on_a_flip(flip: Flip) -> None:
    _, m = run(flip)
    for name in ("noi", "cap_rate", "cash_on_cash", "dscr", "grm", "break_even_occupancy"):
        assert np.isnan(getattr(m, name)[0]), name


def test_no_dscr_without_debt(ops: Operations) -> None:
    _, m = run(BuyAndHold(price=200_000, operations=ops, down_payment_rate=1.0))
    assert np.isnan(m.dscr[0])
    assert m.debt_service[0] == 0


def test_payback_month_is_when_cumulative_cash_turns_positive() -> None:
    ops = Operations(
        monthly_rent=1_100,
        property_tax_annual=0,
        insurance_annual=0,
        vacancy_rate=0,
        management_rate=0,
        maintenance_rate=0,
        capex_rate=0,
    )
    deal = Deal(
        price=10_000,
        closing_costs=0,
        operations=ops,
        appreciation=0.0,
        exit=Exit(month=24, selling_cost_rate=1.0),
    )
    m = measure(build(deal))
    assert m.payback_month[0] == 10


def test_payback_is_nan_when_the_deal_never_pays_back() -> None:
    deal = Deal(
        price=10_000, closing_costs=0, appreciation=0.0, exit=Exit(month=12, selling_cost_rate=0.5)
    )
    assert np.isnan(measure(build(deal)).payback_month[0])


def test_roi_annualizes_by_compounding(flip: Flip) -> None:
    _, m = run(flip)
    assert m.roi[0] == pytest.approx(m.total_profit[0] / m.peak_cash[0])
    assert m.annualized_roi[0] == pytest.approx((1 + m.roi[0]) ** 2 - 1)


def test_net_sale_proceeds_after_costs_and_payoff(rental: BuyAndHold) -> None:
    led, m = run(rental)
    expected = led.sale_price[0, 120] * 0.94 - led.loan_payoffs[0, 120]
    assert m.net_sale_proceeds[0] == pytest.approx(expected)
