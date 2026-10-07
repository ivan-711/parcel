"""Turns a Deal into a month-by-month cash flow ledger.

Every line is a (runs, months + 1) array where column 0 is closing day. Lines
hold positive magnitudes named for what they are; `cash_flow` applies the signs
from the investor's side, so money out is negative there.
"""

from dataclasses import dataclass, fields, is_dataclass

import numpy as np
from numpy.typing import NDArray

from parcel.engine.loans import Grid, Schedule, amortizing, interest_only
from parcel.engine.model import Deal, Loan, Num, Operations


@dataclass(frozen=True)
class Ledger:
    runs: int
    horizon: int
    income_start: int
    """Last month without rent. Rent is collected from the month after."""
    stabilized: int
    """Last month before the deal runs on full rent and its long-term financing."""

    gross_rent: Grid
    vacancy: Grid
    other_income: Grid
    taxes: Grid
    insurance: Grid
    hoa: Grid
    utilities: Grid
    management: Grid
    maintenance: Grid
    capex: Grid
    interest: Grid
    principal: Grid
    rehab: Grid
    purchase: Grid
    closing_costs: Grid
    points: Grid
    loan_funding: Grid
    rehab_draws: Grid
    loan_payoffs: Grid
    refi_proceeds: Grid
    refi_costs: Grid
    sale_price: Grid
    selling_costs: Grid
    value: Grid
    debt: Grid

    @property
    def egi(self) -> Grid:
        return self.gross_rent - self.vacancy + self.other_income

    @property
    def fixed_expenses(self) -> Grid:
        return self.taxes + self.insurance + self.hoa + self.utilities

    @property
    def opex(self) -> Grid:
        return self.fixed_expenses + self.management + self.maintenance

    @property
    def noi(self) -> Grid:
        return self.egi - self.opex

    @property
    def debt_service(self) -> Grid:
        return self.interest + self.principal

    @property
    def cash_flow(self) -> Grid:
        return (
            self.unlevered_cash_flow
            - self.debt_service
            - self.points
            + self.loan_funding
            + self.rehab_draws
            - self.loan_payoffs
            + self.refi_proceeds
            - self.refi_costs
        )

    @property
    def unlevered_cash_flow(self) -> Grid:
        return (
            self.noi
            - self.capex
            - self.rehab
            - self.purchase
            - self.closing_costs
            + self.sale_price
            - self.selling_costs
        )

    @property
    def equity(self) -> Grid:
        return self.value - self.debt


class _Shape:
    def __init__(self, runs: int, horizon: int) -> None:
        self.runs = runs
        self.horizon = horizon

    def col(self, x: Num) -> Grid:
        arr = np.asarray(x, dtype=np.float64).reshape(-1, 1)
        return np.broadcast_to(arr, (self.runs, 1))

    def zeros(self) -> Grid:
        return np.zeros((self.runs, self.horizon + 1))

    def at(self, month: int, amount: Num | Grid) -> Grid:
        out = self.zeros()
        out[:, month] = self.col(amount)[:, 0]
        return out


def build(deal: Deal) -> Ledger:
    _check(deal)
    h = deal.horizon
    s = _Shape(_runs(deal), h)
    m = np.arange(h + 1)

    as_is = s.col(deal.price if deal.as_is_value is None else deal.as_is_value)
    arv = as_is if deal.after_repair_value is None else s.col(deal.after_repair_value)
    value = _value_path(as_is, arv, s.col(deal.appreciation), deal.rehab_months, m)

    rehab = s.zeros()
    if deal.rehab_months == 0:
        rehab[:, 0] = s.col(deal.rehab_cost)[:, 0]
    else:
        rehab[:, 1 : deal.rehab_months + 1] = s.col(deal.rehab_cost) / deal.rehab_months

    ops = deal.operations
    income_start = deal.rehab_months + (ops.lease_up_months if ops else 0)
    lines = _operating(ops, s, income_start)

    refi = deal.refinance
    retire = refi.month if refi else h
    schedules: list[Schedule] = []
    draws = s.zeros()
    for loan in deal.loans:
        sched, loan_draws = _loan(loan, s, retire, rehab)
        schedules.append(sched)
        draws = draws + loan_draws

    refi_proceeds = refi_costs = s.zeros()
    if refi:
        new_principal = s.col(refi.ltv) * value[:, refi.month : refi.month + 1]
        schedules.append(
            amortizing(
                new_principal,
                s.col(refi.annual_rate),
                h,
                amort_months=refi.amort_months,
                start=refi.month,
                retire=h,
            )
        )
        refi_proceeds = s.at(refi.month, new_principal)
        refi_costs = s.at(refi.month, new_principal * s.col(refi.closing_cost_rate))

    funded = sum((s.col(loan.principal) for loan in deal.loans), s.col(0.0))
    points = sum((s.col(loan.principal) * s.col(loan.points) for loan in deal.loans), s.col(0.0))
    operating = lines["gross_rent"] - lines["vacancy"] + lines["other_income"]
    operating = operating - sum(lines[k] for k in _OPEX)
    sale = s.at(h, _sale_price(deal, s, value, operating))

    return Ledger(
        runs=s.runs,
        horizon=h,
        income_start=income_start,
        stabilized=max(income_start, refi.month if refi else 0),
        **lines,
        interest=_total(schedules, "interest", s),
        principal=_total(schedules, "principal", s),
        rehab=rehab,
        purchase=s.at(0, deal.price),
        closing_costs=s.at(0, s.col(deal.closing_costs) + s.col(deal.extra_cash_at_close)),
        points=s.at(0, points),
        loan_funding=s.at(0, funded),
        rehab_draws=draws,
        loan_payoffs=_total(schedules, "payoff", s),
        refi_proceeds=refi_proceeds,
        refi_costs=refi_costs,
        sale_price=sale,
        selling_costs=sale * s.col(deal.exit.selling_cost_rate),
        value=value,
        debt=_total(schedules, "balance", s),
    )


_OPEX = ("taxes", "insurance", "hoa", "utilities", "management", "maintenance")


def _operating(ops: Operations | None, s: _Shape, income_start: int) -> dict[str, Grid]:
    names = ("gross_rent", "vacancy", "other_income", *_OPEX, "capex")
    if ops is None:
        return {name: s.zeros() for name in names}
    m = np.arange(s.horizon + 1)
    owned = m >= 1
    year = np.maximum(m - 1, 0) // 12
    renting = m > income_start
    rent_step = (1 + s.col(ops.rent_growth)) ** year
    cost_step = (1 + s.col(ops.expense_growth)) ** year

    def fixed(monthly: Grid) -> Grid:
        return np.where(owned, monthly * cost_step, 0.0)

    gross_rent = np.where(renting, s.col(ops.monthly_rent) * rent_step, 0.0)
    vacancy = gross_rent * s.col(ops.vacancy_rate)
    other = np.where(renting, s.col(ops.other_income_monthly) * rent_step, 0.0)
    collected = gross_rent - vacancy + other
    return {
        "gross_rent": gross_rent,
        "vacancy": vacancy,
        "other_income": other,
        "taxes": fixed(s.col(ops.property_tax_annual) / 12),
        "insurance": fixed(s.col(ops.insurance_annual) / 12),
        "hoa": fixed(s.col(ops.hoa_monthly)),
        "utilities": fixed(s.col(ops.utilities_monthly)),
        "management": collected * s.col(ops.management_rate),
        "maintenance": collected * s.col(ops.maintenance_rate),
        "capex": collected * s.col(ops.capex_rate),
    }


def _check(deal: Deal) -> None:
    h = deal.horizon
    if h < 1:
        raise ValueError("a deal has to run at least one month")
    if deal.rehab_months >= h:
        raise ValueError("rehab has to finish before the exit month")
    if deal.refinance and not deal.rehab_months <= deal.refinance.month < h:
        raise ValueError("a refinance has to land after rehab and before the exit")
    for loan in deal.loans:
        if loan.amort_months is not None and np.any(np.asarray(loan.rehab_share) != 0):
            raise ValueError(f"{loan.label}: only interest-only loans can fund rehab draws")


def _runs(deal: Deal) -> int:
    sizes = {v.size for v in _amounts(deal)} - {1}
    if len(sizes) > 1:
        raise ValueError(f"sampled inputs disagree on run count: {sorted(sizes)}")
    return sizes.pop() if sizes else 1


def _amounts(obj: object) -> list[np.ndarray]:
    if is_dataclass(obj) and not isinstance(obj, type):
        return [a for f in fields(obj) for a in _amounts(getattr(obj, f.name))]
    if isinstance(obj, tuple):
        return [a for item in obj for a in _amounts(item)]
    if isinstance(obj, np.ndarray):
        return [obj]
    return []


def _value_path(
    as_is: Grid, arv: Grid, appreciation: Grid, rehab_months: int, m: NDArray[np.int_]
) -> Grid:
    monthly = (1 + appreciation) ** (1 / 12) - 1
    grown = arv * (1 + monthly) ** np.maximum(m - rehab_months, 0)
    if rehab_months == 0:
        return grown
    during = as_is + (arv - as_is) * (m / rehab_months)
    path: Grid = np.where(m <= rehab_months, during, grown)
    return path


def _loan(loan: Loan, s: _Shape, retire: int, rehab: Grid) -> tuple[Schedule, Grid]:
    end = min(retire, loan.term_months) if loan.term_months else retire
    principal = s.col(loan.principal)
    rate = s.col(loan.annual_rate)
    if loan.amort_months is None:
        draws = rehab * s.col(loan.rehab_share)
        draws[:, end + 1 :] = 0.0
        return interest_only(principal, rate, s.horizon, retire=end, draws=draws), draws
    sched = amortizing(
        principal,
        rate,
        s.horizon,
        amort_months=loan.amort_months,
        io_months=loan.io_months,
        retire=end,
    )
    return sched, s.zeros()


def _total(schedules: list[Schedule], line: str, s: _Shape) -> Grid:
    return sum((getattr(sc, line) for sc in schedules), s.zeros())


def _sale_price(deal: Deal, s: _Shape, value: Grid, operating: Grid) -> Grid:
    h = deal.horizon
    cap = deal.exit.exit_cap_rate
    if cap is None or deal.operations is None:
        return value[:, h]
    if h - deal.rehab_months < 12:
        raise ValueError("pricing a sale off a cap rate needs 12 months of operations")
    forward = operating[:, h - 11 : h + 1].sum(axis=1) * (
        1 + s.col(deal.operations.rent_growth)[:, 0]
    )
    return forward / s.col(cap)[:, 0]
