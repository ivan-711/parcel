import pytest

from parcel.domain.analysis import analyze
from parcel.schemas import inputs as i
from parcel.schemas.analysis import Analysis, WholesaleAnalysis


def ops(**overrides: float) -> i.Operations:
    base = {"monthly_rent": 2_000.0, "property_tax_annual": 3_000.0, "insurance_annual": 1_200.0}
    return i.Operations.model_validate({**base, **overrides})


def codes(spec: i.Inputs) -> set[str]:
    return {f.code for f in analyze(spec).flags}


def test_a_healthy_rental_raises_nothing() -> None:
    spec = i.BuyAndHold(price=180_000, operations=ops(monthly_rent=2_400), interest_rate=0.06)
    assert codes(spec) == set()


def test_rent_that_cannot_cover_the_loan() -> None:
    spec = i.BuyAndHold(price=400_000, operations=ops(), interest_rate=0.08)
    assert {"dscr_below_1", "negative_cash_flow", "negative_leverage"} <= codes(spec)


def test_optimistic_assumptions_are_called_out() -> None:
    spec = i.BuyAndHold(
        price=180_000, operations=ops(monthly_rent=2_400, vacancy_rate=0.01, capex_rate=0)
    )
    assert {"low_vacancy", "no_capex"} <= codes(spec)


def test_an_all_cash_rental_has_no_leverage_flags() -> None:
    spec = i.BuyAndHold(price=400_000, operations=ops(), down_payment_rate=1.0)
    assert "negative_leverage" not in codes(spec)


@pytest.mark.parametrize(
    ("arv", "code"),
    [(150_000, "refi_short"), (210_000, "cash_left"), (260_000, "all_cash_out")],
)
def test_brrrr_refinance_outcomes(arv: float, code: str) -> None:
    spec = i.Brrrr(
        price=110_000,
        rehab_cost=45_000,
        rehab_months=4,
        after_repair_value=arv,
        operations=ops(monthly_rent=1_800),
    )
    assert code in codes(spec)


def test_a_thin_flip() -> None:
    spec = i.Flip(
        price=170_000,
        rehab_cost=40_000,
        after_repair_value=240_000,
        property_tax_annual=2_400,
        insurance_annual=1_800,
    )
    assert "thin_flip" in codes(spec)


def test_a_flip_that_never_makes_money_has_no_irr() -> None:
    spec = i.Flip(
        price=250_000,
        rehab_cost=60_000,
        after_repair_value=150_000,
        property_tax_annual=2_400,
        insurance_annual=1_800,
        loan_to_cost=0.9,
    )
    assert "no_irr" in codes(spec)


def test_subject_to_risks() -> None:
    spec = i.CreativeFinance(
        price=200_000,
        operations=ops(),
        existing_balance=140_000,
        existing_rate=0.035,
        existing_months_left=300,
        cash_to_seller=10_000,
        seller_balloon_years=5,
    )
    result = analyze(spec)
    assert isinstance(result, Analysis)
    messages = {f.code: f.message for f in result.flags}
    assert "due_on_sale" in messages
    assert messages["balloon"] == "A $45,914 balloon payment comes due in month 60."
    assert any(e.kind == "balloon" and e.month == 60 for e in result.events)


@pytest.mark.parametrize(
    ("contract", "rehab", "code"),
    [
        (140_000, 40_000, "contract_too_high"),
        (127_000, 40_000, "thin_fee"),
        (50_000, 230_000, "no_buyer_margin"),
    ],
)
def test_wholesale_outcomes(contract: float, rehab: float, code: str) -> None:
    spec = i.Wholesale(
        contract_price=contract,
        after_repair_value=240_000,
        rehab_cost=rehab,
        property_tax_annual=2_400,
        insurance_annual=1_800,
    )
    result = analyze(spec)
    assert isinstance(result, WholesaleAnalysis)
    assert code in {f.code for f in result.flags}


def test_yearly_rollup_adds_up_to_the_monthly_ledger() -> None:
    result = analyze(i.BuyAndHold(price=250_000, operations=ops()), monthly=True)
    assert isinstance(result, Analysis)
    assert result.months is not None
    total_by_year = sum(y.cash_flow for y in result.years)
    total_by_month = sum(m.cash_flow for m in result.months)
    assert total_by_year == pytest.approx(total_by_month, abs=0.01 * len(result.months))
    assert result.years[-1].cumulative_cash_flow == pytest.approx(
        result.metrics.total_profit, abs=0.01
    )


def test_rehab_and_refinance_show_up_as_events() -> None:
    spec = i.Brrrr(
        price=110_000,
        rehab_cost=45_000,
        rehab_months=4,
        after_repair_value=210_000,
        operations=ops(monthly_rent=1_800, lease_up_months=1),
    )
    result = analyze(spec)
    assert isinstance(result, Analysis)
    kinds = [(e.kind, e.month) for e in result.events]
    assert kinds == [
        ("purchase", 0),
        ("rehab_done", 4),
        ("rent_starts", 6),
        ("refinance", 6),
        ("sale", 120),
    ]
