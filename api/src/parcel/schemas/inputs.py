"""Strategy inputs as the API accepts them.

Dollars are plain numbers and rates are decimals (0.07 for 7%). Each model
knows how to become the engine's dataclass, so validation lives here and the
engine can trust what it gets.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from parcel.engine import model, strategies, wholesale

Money = Annotated[float, Field(ge=0, le=1_000_000_000)]
Rate = Annotated[float, Field(ge=0, le=1)]
Growth = Annotated[float, Field(ge=-0.2, le=0.3)]
Months = Annotated[int, Field(ge=0, le=600)]
Years = Annotated[int, Field(ge=1, le=40)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Operations(_Strict):
    monthly_rent: Money
    property_tax_annual: Money
    insurance_annual: Money
    other_income_monthly: Money = 0
    vacancy_rate: Rate = 0.05
    hoa_monthly: Money = 0
    utilities_monthly: Money = 0
    management_rate: Rate = 0.08
    maintenance_rate: Rate = 0.05
    capex_rate: Rate = 0.05
    rent_growth: Growth = 0.03
    expense_growth: Growth = 0.03
    lease_up_months: Months = 0

    def to_engine(self) -> model.Operations:
        return model.Operations(**self.model_dump())


class BuyAndHold(_Strict):
    strategy: Literal["buy_and_hold"] = "buy_and_hold"
    price: Money
    operations: Operations
    down_payment_rate: Rate = 0.25
    interest_rate: Rate = 0.07
    amort_years: Years = 30
    points: Rate = 0
    closing_cost_rate: Rate = 0.03
    rehab_cost: Money = 0
    rehab_months: Months = 0
    after_repair_value: Money | None = None
    appreciation: Growth = 0.03
    hold_years: Years = 10
    selling_cost_rate: Rate = 0.06
    exit_cap_rate: Annotated[float, Field(gt=0, le=0.3)] | None = None

    def to_engine(self) -> strategies.BuyAndHold:
        data = self.model_dump(exclude={"strategy", "operations"})
        return strategies.BuyAndHold(operations=self.operations.to_engine(), **data)


class Brrrr(_Strict):
    strategy: Literal["brrrr"] = "brrrr"
    price: Money
    rehab_cost: Money
    rehab_months: Months
    after_repair_value: Money
    operations: Operations
    loan_to_cost: Rate = 0.85
    rehab_financed: Rate = 1.0
    acquisition_rate: Rate = 0.11
    acquisition_points: Rate = 0.02
    closing_cost_rate: Rate = 0.03
    seasoning_months: Months = 6
    refi_ltv: Rate = 0.75
    refi_rate: Rate = 0.07
    refi_amort_years: Years = 30
    refi_closing_cost_rate: Rate = 0.02
    appreciation: Growth = 0.03
    hold_years: Years = 10
    selling_cost_rate: Rate = 0.06

    def to_engine(self) -> strategies.Brrrr:
        data = self.model_dump(exclude={"strategy", "operations"})
        return strategies.Brrrr(operations=self.operations.to_engine(), **data)


class Flip(_Strict):
    strategy: Literal["flip"] = "flip"
    price: Money
    rehab_cost: Money
    after_repair_value: Money
    rehab_months: Annotated[int, Field(ge=0, le=36)] = 4
    months_to_sell: Annotated[int, Field(ge=1, le=24)] = 2
    property_tax_annual: Money
    insurance_annual: Money
    utilities_monthly: Money = 0
    loan_to_cost: Rate = 0
    rehab_financed: Rate = 0
    interest_rate: Rate = 0.11
    points: Rate = 0.02
    closing_cost_rate: Rate = 0.02
    selling_cost_rate: Rate = 0.08

    def to_engine(self) -> strategies.Flip:
        return strategies.Flip(**self.model_dump(exclude={"strategy"}))


class CreativeFinance(_Strict):
    strategy: Literal["creative"] = "creative"
    price: Money
    operations: Operations
    existing_balance: Money
    existing_rate: Rate
    existing_months_left: Annotated[int, Field(ge=1, le=480)]
    cash_to_seller: Money = 0
    arrears: Money = 0
    seller_rate: Rate = 0.05
    seller_amort_years: Years | None = 30
    seller_balloon_years: Years | None = None
    closing_cost_rate: Rate = 0.01
    rehab_cost: Money = 0
    rehab_months: Months = 0
    after_repair_value: Money | None = None
    appreciation: Growth = 0.03
    hold_years: Years = 10
    selling_cost_rate: Rate = 0.06

    def to_engine(self) -> strategies.CreativeFinance:
        data = self.model_dump(exclude={"strategy", "operations"})
        return strategies.CreativeFinance(operations=self.operations.to_engine(), **data)


class Wholesale(_Strict):
    strategy: Literal["wholesale"] = "wholesale"
    contract_price: Money
    after_repair_value: Money
    rehab_cost: Money
    buyer_profit_margin: Rate = 0.15
    earnest_money: Money = 1_000
    buyer_rehab_months: Annotated[int, Field(ge=0, le=36)] = 4
    buyer_months_to_sell: Annotated[int, Field(ge=1, le=24)] = 2
    property_tax_annual: Money
    insurance_annual: Money
    buyer_loan_to_cost: Rate = 0.9
    buyer_rehab_financed: Rate = 1.0
    buyer_interest_rate: Rate = 0.11
    buyer_points: Rate = 0.02

    def to_engine(self) -> wholesale.Wholesale:
        buyer = strategies.Flip(
            price=self.contract_price,
            rehab_cost=self.rehab_cost,
            after_repair_value=self.after_repair_value,
            rehab_months=self.buyer_rehab_months,
            months_to_sell=self.buyer_months_to_sell,
            property_tax_annual=self.property_tax_annual,
            insurance_annual=self.insurance_annual,
            loan_to_cost=self.buyer_loan_to_cost,
            rehab_financed=self.buyer_rehab_financed,
            interest_rate=self.buyer_interest_rate,
            points=self.buyer_points,
        )
        return wholesale.Wholesale(
            contract_price=self.contract_price,
            buyer=buyer,
            buyer_profit_margin=self.buyer_profit_margin,
            earnest_money=self.earnest_money,
        )


Inputs = Annotated[
    BuyAndHold | Brrrr | Flip | CreativeFinance | Wholesale, Field(discriminator="strategy")
]
Holding = BuyAndHold | Brrrr | Flip | CreativeFinance
"""Strategies that own the property, which is everything except wholesale."""
