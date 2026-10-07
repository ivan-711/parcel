import numpy as np
import pytest

from parcel.engine.ledger import build
from parcel.engine.model import Deal, Exit, Loan, Operations, Refinance
from parcel.engine.strategies import Brrrr, BuyAndHold

from .reference import Rental, cash_flows


def test_matches_the_independent_reference_model(rental: BuyAndHold) -> None:
    expected = cash_flows(
        Rental(
            price=250_000,
            down_rate=0.25,
            rate=0.07,
            years=30,
            closing_rate=0.03,
            rent=2_000,
            vacancy=0.05,
            tax=3_000,
            insurance=1_200,
            management=0.08,
            maintenance=0.05,
            capex=0.05,
            rent_growth=0.03,
            expense_growth=0.03,
            appreciation=0.03,
            hold_years=10,
            selling_rate=0.06,
        )
    )
    assert build(rental.deal()).cash_flow[0] == pytest.approx(expected, abs=1e-6)


def test_first_month_lines_by_hand(rental: BuyAndHold) -> None:
    led = build(rental.deal())
    assert led.gross_rent[0, 1] == 2_000
    assert led.vacancy[0, 1] == pytest.approx(100)
    assert led.taxes[0, 1] == pytest.approx(250)
    assert led.insurance[0, 1] == pytest.approx(100)
    assert led.management[0, 1] == pytest.approx(152)
    assert led.maintenance[0, 1] == pytest.approx(95)
    assert led.noi[0, 1] == pytest.approx(1_900 - 250 - 100 - 152 - 95)
    assert led.cash_flow[0, 0] == pytest.approx(-(62_500 + 7_500))


def test_rent_and_expenses_grow_separately_each_year(ops: Operations) -> None:
    grown = Operations(**{**ops.__dict__, "rent_growth": 0.04, "expense_growth": 0.02})
    led = build(BuyAndHold(price=250_000, operations=grown).deal())
    assert led.gross_rent[0, 13] == pytest.approx(2_000 * 1.04)
    assert led.taxes[0, 13] == pytest.approx(250 * 1.02)
    assert led.gross_rent[0, 12] == 2_000


def test_value_climbs_to_arv_during_rehab_then_appreciates() -> None:
    deal = Deal(
        price=100_000,
        closing_costs=0,
        rehab_cost=40_000,
        rehab_months=4,
        after_repair_value=180_000,
        appreciation=0.12,
        exit=Exit(month=16),
    )
    value = build(deal).value[0]
    assert value[0] == 100_000
    assert value[2] == pytest.approx(140_000)
    assert value[4] == pytest.approx(180_000)
    assert value[16] == pytest.approx(180_000 * 1.12)


def test_rehab_with_no_timeline_is_paid_at_closing() -> None:
    led = build(Deal(price=100_000, closing_costs=0, rehab_cost=20_000, exit=Exit(month=12)))
    assert led.rehab[0, 0] == 20_000
    assert led.rehab[0, 1:].sum() == 0


def test_no_rent_before_rehab_and_lease_up_finish(brrrr: Brrrr) -> None:
    led = build(brrrr.deal())
    assert led.income_start == 5
    assert led.gross_rent[0, :6].sum() == 0
    assert led.gross_rent[0, 6] == pytest.approx(1_800)
    assert led.taxes[0, 1] > 0


def test_refinance_pays_off_the_bridge_loan(brrrr: Brrrr) -> None:
    led = build(brrrr.deal())
    month = brrrr.refi_month
    assert led.loan_payoffs[0, month] == pytest.approx(85_000 + 50_000)
    assert led.refi_proceeds[0, month] == pytest.approx(0.75 * led.value[0, month])
    assert led.stabilized == month


def test_exit_cap_prices_the_sale_off_forward_noi(ops: Operations) -> None:
    deal = BuyAndHold(price=250_000, operations=ops, exit_cap_rate=0.07, hold_years=5).deal()
    led = build(deal)
    trailing = led.noi[0, 49:61].sum()
    assert led.sale_price[0, 60] == pytest.approx(trailing * 1.03 / 0.07)


def test_exit_cap_needs_a_year_of_operations(ops: Operations) -> None:
    deal = Deal(
        price=1,
        closing_costs=0,
        operations=ops,
        rehab_months=3,
        exit=Exit(month=10, exit_cap_rate=0.07),
    )
    with pytest.raises(ValueError, match="12 months"):
        build(deal)


@pytest.mark.parametrize(
    ("deal", "message"),
    [
        (Deal(price=1, closing_costs=0, exit=Exit(month=0)), "at least one month"),
        (Deal(price=1, closing_costs=0, rehab_months=6, exit=Exit(month=6)), "rehab has to finish"),
        (
            Deal(
                price=1,
                closing_costs=0,
                rehab_months=4,
                exit=Exit(month=12),
                refinance=Refinance(month=2, ltv=0.75, annual_rate=0.07),
            ),
            "refinance",
        ),
        (
            Deal(
                price=1,
                closing_costs=0,
                exit=Exit(month=12),
                loans=(Loan(principal=1, annual_rate=0.1, rehab_share=0.5),),
            ),
            "interest-only",
        ),
        (
            Deal(
                price=np.array([1.0, 2.0]),
                closing_costs=np.array([1.0, 2.0, 3.0]),
                exit=Exit(month=12),
            ),
            "disagree",
        ),
    ],
)
def test_rejects_impossible_deals(deal: Deal, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        build(deal)


def test_sampled_inputs_run_side_by_side(rental: BuyAndHold) -> None:
    prices = np.array([200_000.0, 250_000.0, 300_000.0])
    batch = build(BuyAndHold(price=prices, operations=rental.operations).deal())
    for i, price in enumerate(prices):
        single = build(BuyAndHold(price=float(price), operations=rental.operations).deal())
        assert batch.cash_flow[i] == pytest.approx(single.cash_flow[0])


def test_a_deal_without_operations_has_no_rent_lines() -> None:
    led = build(
        Deal(
            price=100_000,
            closing_costs=1_000,
            appreciation=0.0,
            exit=Exit(month=3, selling_cost_rate=0.0),
        )
    )
    assert led.egi.sum() == 0
    assert led.cash_flow.sum() == pytest.approx(-1_000)


def test_equity_is_value_less_debt(rental: BuyAndHold) -> None:
    led = build(rental.deal())
    assert led.equity[0, 0] == pytest.approx(250_000 - 187_500)
    assert led.equity[0, 60] == pytest.approx(led.value[0, 60] - led.debt[0, 60])
