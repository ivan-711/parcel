"""Strategy behavior, including the mistakes the first version of Parcel made.

Each test named `test_*_regression` pins a specific error from that version so
it cannot come back.
"""

from dataclasses import replace

import numpy as np
import numpy_financial as npf
import pytest

from parcel.engine.analysis import run, solve
from parcel.engine.ledger import build
from parcel.engine.model import Operations
from parcel.engine.strategies import Brrrr, BuyAndHold, CreativeFinance, Flip, carrying_costs
from parcel.engine.wholesale import Wholesale, underwrite


def test_flip_profit_by_hand(flip: Flip) -> None:
    led, m = run(flip)
    interest = (135_000 + 145_000 + 155_000 + 165_000 + 175_000 + 175_000) * 0.11 / 12
    carry = 6 * (200 + 150 + 100)
    expected = 240_000 * 0.92 - 150_000 - 3_000 - 40_000 - 2_700 - carry - interest
    assert m.total_profit[0] == pytest.approx(expected)
    assert led.loan_payoffs[0, 6] == pytest.approx(175_000)


def test_flip_holding_costs_reduce_profit_regression(flip: Flip) -> None:
    _, with_carry = run(flip)
    _, without = run(replace(flip, property_tax_annual=0, insurance_annual=0, utilities_monthly=0))
    assert without.total_profit[0] - with_carry.total_profit[0] == pytest.approx(6 * 450)


def test_reverse_and_forward_agree_regression(flip: Flip) -> None:
    price = solve(flip, "price", metric_name="roi", target=0.25, lo=50_000, hi=240_000)
    assert price is not None
    _, m = run(replace(flip, price=price))
    assert m.roi[0] == pytest.approx(0.25, abs=1e-6)


def test_taxes_and_insurance_cannot_silently_default_to_zero_regression() -> None:
    with pytest.raises(TypeError):
        Operations(monthly_rent=2_000)  # type: ignore[call-arg]


def test_brrrr_appreciates_from_arv_not_purchase_price_regression(brrrr: Brrrr) -> None:
    led = build(brrrr.deal())
    month = brrrr.refi_month
    assert led.value[0, month] == pytest.approx(200_000 * 1.03 ** ((month - 4) / 12))
    assert led.value[0, 120] == pytest.approx(200_000 * 1.03 ** (116 / 12))


def test_brrrr_reverse_solve_includes_closing_costs_regression(brrrr: Brrrr) -> None:
    price = solve(
        brrrr, "price", metric_name="cash_left_in_deal", target=0.0, lo=50_000, hi=200_000
    )
    assert price is not None
    _, m = run(replace(brrrr, price=price))
    assert m.cash_left_in_deal[0] == pytest.approx(0, abs=0.01)


def test_brrrr_cash_out_and_cash_left(brrrr: Brrrr) -> None:
    led, m = run(brrrr)
    month = brrrr.refi_month
    new_loan = 0.75 * led.value[0, month]
    assert m.refi_cash_out[0] == pytest.approx(new_loan * 0.98 - 135_000)
    assert m.cash_left_in_deal[0] == pytest.approx(-np.cumsum(led.cash_flow[0])[month])


def test_all_cash_brrrr_has_no_bridge_interest(brrrr: Brrrr) -> None:
    led = build(replace(brrrr, loan_to_cost=0.0, rehab_financed=0.0).deal())
    assert led.interest[0, : brrrr.refi_month + 1].sum() == 0
    assert led.points.sum() == 0


def test_seller_note_is_price_less_existing_loan_and_down_regression(
    creative: CreativeFinance,
) -> None:
    assert creative.seller_note == pytest.approx(200_000 - 140_000 - 10_000)
    led, m = run(creative)
    assert m.cash_to_close[0] == pytest.approx(10_000 + 2_000)
    existing = -npf.pmt(0.035 / 12, 300, 140_000)
    note = -npf.pmt(0.05 / 12, 360, 50_000)
    assert led.debt_service[0, 1] == pytest.approx(existing + note)


def test_seller_note_balloons_at_term(creative: CreativeFinance) -> None:
    led = build(creative.deal())
    balance = npf.fv(0.05 / 12, 60, npf.pmt(0.05 / 12, 360, 50_000), 50_000)
    assert led.loan_payoffs[0, 60] == pytest.approx(-balance)


def test_interest_only_seller_note(creative: CreativeFinance) -> None:
    led = build(replace(creative, seller_amort_years=None, existing_balance=0.0).deal())
    assert led.interest[0, 1] == pytest.approx(190_000 * 0.05 / 12)
    assert led.principal[0, 1] == pytest.approx(0)


def test_arrears_are_paid_at_closing(creative: CreativeFinance) -> None:
    _, base = run(creative)
    _, behind = run(replace(creative, arrears=4_500))
    assert behind.cash_to_close[0] - base.cash_to_close[0] == pytest.approx(4_500)


def test_dscr_uses_noi_not_gross_rent_regression(creative: CreativeFinance) -> None:
    _, m = run(creative)
    assert m.dscr[0] == pytest.approx(m.noi[0] / m.debt_service[0])
    assert m.dscr[0] < m.gross_rent[0] / m.debt_service[0]


def test_cash_flow_growth_is_not_compounded_net_cash_flow_regression(ops: Operations) -> None:
    deal = BuyAndHold(price=250_000, operations=replace(ops, rent_growth=0.05, expense_growth=0.0))
    led = build(deal.deal())
    y1 = led.cash_flow[0, 1:13].sum()
    y2 = led.cash_flow[0, 13:25].sum()
    added_rent = 24_000 * 0.05 * 0.95 * (1 - 0.18)
    assert y2 - y1 == pytest.approx(added_rent)


def test_wholesale_fee_leaves_the_buyer_their_margin() -> None:
    buyer = Flip(
        price=1.0,
        rehab_cost=40_000,
        after_repair_value=240_000,
        property_tax_annual=2_400,
        insurance_annual=1_800,
    )
    result = underwrite(Wholesale(contract_price=120_000, buyer=buyer, buyer_profit_margin=0.15))
    assert result.buyer_max_price is not None
    assert result.buyer_profit_at_max == pytest.approx(36_000, abs=0.01)
    assert result.assignment_fee == pytest.approx(result.buyer_max_price - 120_000)
    assert result.seventy_percent_rule == pytest.approx(0.7 * 240_000 - 40_000)


def test_wholesale_with_no_room_for_the_buyer() -> None:
    buyer = Flip(price=1.0, rehab_cost=200_000, after_repair_value=210_000)
    result = underwrite(Wholesale(contract_price=50_000, buyer=buyer))
    assert result.buyer_max_price is None
    assert result.assignment_fee is None


def test_carrying_costs_have_no_income_side() -> None:
    ops = carrying_costs(2_400, 1_200, 90)
    assert ops.monthly_rent == 0
    assert ops.vacancy_rate == ops.management_rate == ops.capex_rate == 0
