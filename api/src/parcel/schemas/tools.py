from typing import Annotated, Literal

from pydantic import BaseModel, Field

from parcel.schemas.analysis import Analysis, WholesaleAnalysis
from parcel.schemas.inputs import Holding, Inputs

Metric = Literal[
    "irr",
    "cash_on_cash",
    "cash_flow",
    "dscr",
    "cap_rate",
    "total_profit",
    "roi",
    "npv",
    "cash_left_in_deal",
    "annualized_roi",
    "equity_multiple",
]
Field_ = Literal[
    "price",
    "operations.monthly_rent",
    "rehab_cost",
    "after_repair_value",
    "down_payment_rate",
    "interest_rate",
    "refi_ltv",
    "cash_to_seller",
    "operations.vacancy_rate",
]


class AnalyzeRequest(BaseModel):
    inputs: Inputs
    monthly: bool = False


class SolveRequest(BaseModel):
    inputs: Holding = Field(discriminator="strategy")
    field: Field_
    metric: Metric
    target: float


class SolveResult(BaseModel):
    value: float | None
    """None when no value of the input reaches the target."""
    analysis: Analysis | None


class SensitivityRequest(BaseModel):
    inputs: Holding = Field(discriminator="strategy")
    metric: Metric = "irr"


class Swing(BaseModel):
    field: str
    low_input: float
    high_input: float
    low_result: float | None
    high_result: float | None


class Grid(BaseModel):
    row_field: str
    row_values: list[float]
    col_field: str
    col_values: list[float]
    values: list[list[float | None]]


class SensitivityResult(BaseModel):
    metric: Metric
    base: float | None
    swings: list[Swing]
    grid: Grid


class SimulateRequest(BaseModel):
    inputs: Holding = Field(discriminator="strategy")
    runs: Annotated[int, Field(ge=500, le=20_000)] = 10_000
    seed: int | None = None


class Histogram(BaseModel):
    edges: list[float]
    counts: list[int]


class SimulateResult(BaseModel):
    runs: int
    probability_of_loss: float
    irr_percentiles: dict[str, float | None]
    profit_percentiles: dict[str, float]
    irr_histogram: Histogram
    profit_histogram: Histogram


AnalyzeResult = Analysis | WholesaleAnalysis
