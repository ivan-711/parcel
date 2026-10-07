import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from parcel.db.models import Stage, Strategy
from parcel.schemas.analysis import Analysis, WholesaleAnalysis
from parcel.schemas.inputs import Inputs

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class Address(BaseModel):
    model_config = ConfigDict(extra="forbid")

    line1: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
    city: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] = ""
    state: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2)] = ""
    zip: Annotated[str, StringConstraints(strip_whitespace=True, max_length=10)] = ""
    county: str | None = None
    latitude: Annotated[float, Field(ge=-90, le=90)] | None = None
    longitude: Annotated[float, Field(ge=-180, le=180)] | None = None


class Source(BaseModel):
    """Where an input came from, so the UI can show what's measured and what's guessed."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["user", "rentcast", "hud", "fred", "census", "estimate"]
    label: Annotated[str, StringConstraints(max_length=200)]
    as_of: date | None = None


Provenance = dict[Annotated[str, StringConstraints(max_length=80)], Source]


class DealCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name
    inputs: Inputs
    address: Address | None = None
    provenance: Provenance = {}
    stage: Stage = Stage.lead
    notes: Annotated[str, StringConstraints(max_length=10_000)] = ""


class DealUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name | None = None
    inputs: Inputs | None = None
    address: Address | None = None
    provenance: Provenance | None = None
    notes: Annotated[str, StringConstraints(max_length=10_000)] | None = None
    acquired_on: date | None = None


class StageMove(BaseModel):
    stage: Stage
    position: Annotated[int, Field(ge=0)]


class Summary(BaseModel):
    irr: float | None
    monthly_cash_flow: float | None
    cash_on_cash: float | None
    cap_rate: float | None
    total_profit: float
    cash_to_close: float
    flags: int


class DealOut(BaseModel):
    id: uuid.UUID
    name: str
    strategy: Strategy
    stage: Stage
    position: int
    address: Address | None
    inputs: Inputs
    provenance: Provenance
    notes: str
    shared: bool
    acquired_on: date | None
    created_at: datetime
    updated_at: datetime
    summary: Summary


class DealDetail(DealOut):
    analysis: Analysis | WholesaleAnalysis


class ShareLink(BaseModel):
    token: str


class SharedDeal(BaseModel):
    name: str
    strategy: Strategy
    address: Address | None
    inputs: Inputs
    provenance: Provenance
    analysis: Analysis | WholesaleAnalysis
    updated_at: datetime


class ActualIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rent_collected: Annotated[float, Field(ge=0, le=10_000_000)]
    operating_expenses: Annotated[float, Field(ge=0, le=10_000_000)]
    debt_service: Annotated[float, Field(ge=0, le=10_000_000)]
    capital_spent: Annotated[float, Field(ge=0, le=10_000_000)] = 0
    note: Annotated[str, StringConstraints(max_length=1_000)] = ""


class ActualOut(ActualIn):
    month: date


class PortfolioMonth(BaseModel):
    month: date
    projected_cash_flow: float
    actual_cash_flow: float | None


class PortfolioProperty(BaseModel):
    deal: DealOut
    months: list[PortfolioMonth]
    projected_to_date: float
    actual_to_date: float


class Portfolio(BaseModel):
    properties: list[PortfolioProperty]
    projected_to_date: float
    actual_to_date: float
    monthly_projected_now: float
