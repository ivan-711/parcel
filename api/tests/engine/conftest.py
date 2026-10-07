import pytest

from parcel.engine.model import Operations
from parcel.engine.strategies import Brrrr, BuyAndHold, CreativeFinance, Flip


@pytest.fixture(scope="session")
def ops() -> Operations:
    return Operations(monthly_rent=2_000, property_tax_annual=3_000, insurance_annual=1_200)


@pytest.fixture(scope="session")
def rental(ops: Operations) -> BuyAndHold:
    return BuyAndHold(price=250_000, operations=ops, interest_rate=0.07)


@pytest.fixture(scope="session")
def flip() -> Flip:
    return Flip(
        price=150_000,
        rehab_cost=40_000,
        after_repair_value=240_000,
        rehab_months=4,
        months_to_sell=2,
        property_tax_annual=2_400,
        insurance_annual=1_800,
        utilities_monthly=100,
        loan_to_cost=0.9,
        rehab_financed=1.0,
    )


@pytest.fixture(scope="session")
def brrrr() -> Brrrr:
    return Brrrr(
        price=100_000,
        rehab_cost=50_000,
        rehab_months=4,
        after_repair_value=200_000,
        operations=Operations(
            monthly_rent=1_800, property_tax_annual=2_400, insurance_annual=1_200, lease_up_months=1
        ),
    )


@pytest.fixture(scope="session")
def creative(ops: Operations) -> CreativeFinance:
    return CreativeFinance(
        price=200_000,
        operations=ops,
        existing_balance=140_000,
        existing_rate=0.035,
        existing_months_left=300,
        cash_to_seller=10_000,
        seller_rate=0.05,
        seller_balloon_years=5,
    )
