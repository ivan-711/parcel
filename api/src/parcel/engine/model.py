"""The deal model the ledger is built from.

Amounts are dollars and rates are annual decimals (0.07 for 7%). Any amount or
rate can also be a numpy array of samples, which is how Monte Carlo runs the
same model thousands of times in one pass. Month counts are always plain ints.
"""

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

type Num = float | NDArray[np.float64]


@dataclass(frozen=True)
class Loan:
    principal: Num
    annual_rate: Num
    amort_months: int | None = 360
    """None means interest only for the life of the loan."""
    io_months: int = 0
    term_months: int | None = None
    """Months until the balance is due. None means it runs until the deal ends."""
    points: Num = 0.0
    """Origination fee as a fraction of principal, paid at closing."""
    rehab_share: Num = 0.0
    """Fraction of each rehab draw this loan funds. Only for interest-only loans."""
    label: str = "Loan"


@dataclass(frozen=True)
class Refinance:
    month: int
    ltv: Num
    annual_rate: Num
    amort_months: int = 360
    closing_cost_rate: Num = 0.02


@dataclass(frozen=True)
class Operations:
    monthly_rent: Num
    property_tax_annual: Num
    insurance_annual: Num
    other_income_monthly: Num = 0.0
    vacancy_rate: Num = 0.05
    hoa_monthly: Num = 0.0
    utilities_monthly: Num = 0.0
    management_rate: Num = 0.08
    maintenance_rate: Num = 0.05
    capex_rate: Num = 0.05
    rent_growth: Num = 0.03
    expense_growth: Num = 0.03
    lease_up_months: int = 0


@dataclass(frozen=True)
class Exit:
    month: int
    selling_cost_rate: Num = 0.06
    exit_cap_rate: Num | None = None
    """When set, the sale price is forward NOI over this cap rate instead of market value."""


@dataclass(frozen=True)
class Deal:
    price: Num
    closing_costs: Num
    exit: Exit
    operations: Operations | None = None
    loans: tuple[Loan, ...] = ()
    refinance: Refinance | None = None
    rehab_cost: Num = 0.0
    rehab_months: int = 0
    as_is_value: Num | None = None
    after_repair_value: Num | None = None
    appreciation: Num = 0.03
    extra_cash_at_close: Num = 0.0
    """Cash paid at closing beyond price and costs, like arrears on an assumed loan."""

    @property
    def horizon(self) -> int:
        return self.exit.month
