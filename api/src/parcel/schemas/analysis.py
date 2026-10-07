from typing import Literal

from pydantic import BaseModel


class Metrics(BaseModel):
    cash_to_close: float
    peak_cash: float
    cash_left_in_deal: float
    total_profit: float
    equity_multiple: float | None
    irr: float | None
    unlevered_irr: float | None
    npv: float
    payback_month: int | None
    roi: float | None
    annualized_roi: float | None
    gross_rent: float | None
    egi: float | None
    opex: float | None
    noi: float | None
    debt_service: float | None
    cash_flow: float | None
    cap_rate: float | None
    yield_on_cost: float | None
    cash_on_cash: float | None
    dscr: float | None
    break_even_occupancy: float | None
    grm: float | None
    refi_cash_out: float
    sale_price: float
    net_sale_proceeds: float


class Period(BaseModel):
    """One row of the ledger, either a month or a year rolled up."""

    period: int
    gross_rent: float
    vacancy: float
    other_income: float
    egi: float
    opex: float
    noi: float
    capex: float
    interest: float
    principal: float
    rehab: float
    cash_flow: float
    cumulative_cash_flow: float
    value: float
    debt: float
    equity: float


class Event(BaseModel):
    month: int
    kind: Literal["purchase", "rehab_done", "rent_starts", "refinance", "balloon", "sale"]
    amount: float | None = None


class Flag(BaseModel):
    code: str
    severity: Literal["info", "caution", "risk"]
    message: str


class Analysis(BaseModel):
    strategy: str
    horizon_months: int
    stabilized_month: int
    metrics: Metrics
    years: list[Period]
    months: list[Period] | None = None
    events: list[Event]
    flags: list[Flag]


class WholesaleAnalysis(BaseModel):
    strategy: Literal["wholesale"] = "wholesale"
    contract_price: float
    buyer_max_price: float | None
    assignment_fee: float | None
    buyer_profit_at_max: float | None
    seventy_percent_rule: float
    earnest_money: float
    buyer: Analysis
    """The end buyer's flip at their maximum price, or at your contract price if none works."""
    flags: list[Flag]
