"""The five strategies, each a set of plain inputs that compiles to a Deal.

The inputs are what an investor thinks in (down payment percent, months to
sell, refinance LTV). `deal()` turns them into loans, a value path, and an exit.
"""

from dataclasses import dataclass

import numpy as np

from parcel.engine.model import Deal, Exit, Loan, Num, Operations, Refinance


def carrying_costs(
    property_tax_annual: Num, insurance_annual: Num, utilities_monthly: Num = 0.0
) -> Operations:
    """Operations for a property that earns no rent while you hold it."""
    return Operations(
        monthly_rent=0.0,
        property_tax_annual=property_tax_annual,
        insurance_annual=insurance_annual,
        utilities_monthly=utilities_monthly,
        vacancy_rate=0.0,
        management_rate=0.0,
        maintenance_rate=0.0,
        capex_rate=0.0,
        rent_growth=0.0,
        expense_growth=0.0,
    )


@dataclass(frozen=True)
class BuyAndHold:
    price: Num
    operations: Operations
    down_payment_rate: Num = 0.25
    interest_rate: Num = 0.07
    amort_years: int = 30
    points: Num = 0.0
    closing_cost_rate: Num = 0.03
    rehab_cost: Num = 0.0
    rehab_months: int = 0
    after_repair_value: Num | None = None
    appreciation: Num = 0.03
    hold_years: int = 10
    selling_cost_rate: Num = 0.06
    exit_cap_rate: Num | None = None

    def deal(self) -> Deal:
        loan = Loan(
            principal=self.price * (1 - np.asarray(self.down_payment_rate)),
            annual_rate=self.interest_rate,
            amort_months=self.amort_years * 12,
            points=self.points,
            label="Mortgage",
        )
        return Deal(
            price=self.price,
            closing_costs=self.price * np.asarray(self.closing_cost_rate),
            operations=self.operations,
            loans=(loan,),
            rehab_cost=self.rehab_cost,
            rehab_months=self.rehab_months,
            after_repair_value=self.after_repair_value,
            appreciation=self.appreciation,
            exit=Exit(
                month=self.hold_years * 12,
                selling_cost_rate=self.selling_cost_rate,
                exit_cap_rate=self.exit_cap_rate,
            ),
        )


@dataclass(frozen=True)
class Brrrr:
    price: Num
    rehab_cost: Num
    rehab_months: int
    after_repair_value: Num
    operations: Operations
    loan_to_cost: Num = 0.85
    """Share of the purchase price the acquisition loan covers. 0 for an all-cash buy."""
    rehab_financed: Num = 1.0
    acquisition_rate: Num = 0.11
    acquisition_points: Num = 0.02
    closing_cost_rate: Num = 0.03
    seasoning_months: int = 6
    """Months from purchase before a lender will refinance off the new value."""
    refi_ltv: Num = 0.75
    refi_rate: Num = 0.07
    refi_amort_years: int = 30
    refi_closing_cost_rate: Num = 0.02
    appreciation: Num = 0.03
    hold_years: int = 10
    selling_cost_rate: Num = 0.06

    @property
    def refi_month(self) -> int:
        return max(self.rehab_months + self.operations.lease_up_months, self.seasoning_months)

    def deal(self) -> Deal:
        bridge = Loan(
            principal=self.price * np.asarray(self.loan_to_cost),
            annual_rate=self.acquisition_rate,
            amort_months=None,
            points=self.acquisition_points,
            rehab_share=self.rehab_financed,
            label="Acquisition loan",
        )
        return Deal(
            price=self.price,
            closing_costs=self.price * np.asarray(self.closing_cost_rate),
            operations=self.operations,
            loans=(bridge,),
            refinance=Refinance(
                month=self.refi_month,
                ltv=self.refi_ltv,
                annual_rate=self.refi_rate,
                amort_months=self.refi_amort_years * 12,
                closing_cost_rate=self.refi_closing_cost_rate,
            ),
            rehab_cost=self.rehab_cost,
            rehab_months=self.rehab_months,
            after_repair_value=self.after_repair_value,
            appreciation=self.appreciation,
            exit=Exit(month=self.hold_years * 12, selling_cost_rate=self.selling_cost_rate),
        )


@dataclass(frozen=True)
class Flip:
    price: Num
    rehab_cost: Num
    after_repair_value: Num
    rehab_months: int = 4
    months_to_sell: int = 2
    property_tax_annual: Num = 0.0
    insurance_annual: Num = 0.0
    utilities_monthly: Num = 0.0
    loan_to_cost: Num = 0.0
    rehab_financed: Num = 0.0
    interest_rate: Num = 0.11
    points: Num = 0.02
    closing_cost_rate: Num = 0.02
    selling_cost_rate: Num = 0.08

    def deal(self) -> Deal:
        loan = Loan(
            principal=self.price * np.asarray(self.loan_to_cost),
            annual_rate=self.interest_rate,
            amort_months=None,
            points=self.points,
            rehab_share=self.rehab_financed,
            label="Hard money loan",
        )
        return Deal(
            price=self.price,
            closing_costs=self.price * np.asarray(self.closing_cost_rate),
            operations=carrying_costs(
                self.property_tax_annual, self.insurance_annual, self.utilities_monthly
            ),
            loans=(loan,),
            rehab_cost=self.rehab_cost,
            rehab_months=self.rehab_months,
            after_repair_value=self.after_repair_value,
            appreciation=0.0,
            exit=Exit(
                month=self.rehab_months + self.months_to_sell,
                selling_cost_rate=self.selling_cost_rate,
            ),
        )


@dataclass(frozen=True)
class CreativeFinance:
    """Buy subject to the seller's existing mortgage, with the seller carrying the rest.

    Set `existing_balance` to 0 for a straight seller-financed purchase.
    """

    price: Num
    operations: Operations
    existing_balance: Num
    existing_rate: Num
    existing_months_left: int
    cash_to_seller: Num = 0.0
    arrears: Num = 0.0
    seller_rate: Num = 0.05
    seller_amort_years: int | None = 30
    """None makes the seller note interest only."""
    seller_balloon_years: int | None = None
    closing_cost_rate: Num = 0.01
    rehab_cost: Num = 0.0
    rehab_months: int = 0
    after_repair_value: Num | None = None
    appreciation: Num = 0.03
    hold_years: int = 10
    selling_cost_rate: Num = 0.06

    @property
    def seller_note(self) -> Num:
        note = np.asarray(self.price) - self.existing_balance - self.cash_to_seller
        return np.maximum(note, 0.0)

    def deal(self) -> Deal:
        existing = Loan(
            principal=self.existing_balance,
            annual_rate=self.existing_rate,
            amort_months=self.existing_months_left,
            label="Existing mortgage",
        )
        note = Loan(
            principal=self.seller_note,
            annual_rate=self.seller_rate,
            amort_months=self.seller_amort_years * 12 if self.seller_amort_years else None,
            term_months=self.seller_balloon_years * 12 if self.seller_balloon_years else None,
            label="Seller note",
        )
        return Deal(
            price=self.price,
            closing_costs=self.price * np.asarray(self.closing_cost_rate),
            extra_cash_at_close=self.arrears,
            operations=self.operations,
            loans=(existing, note),
            rehab_cost=self.rehab_cost,
            rehab_months=self.rehab_months,
            after_repair_value=self.after_repair_value,
            appreciation=self.appreciation,
            exit=Exit(month=self.hold_years * 12, selling_cost_rate=self.selling_cost_rate),
        )
