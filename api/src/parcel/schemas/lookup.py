from datetime import date
from typing import Literal

from pydantic import BaseModel

SourceKind = Literal["user", "rentcast", "hud", "fred", "census", "estimate"]


class SourceOut(BaseModel):
    kind: SourceKind
    label: str
    as_of: date | None = None


class Suggestion(BaseModel):
    value: float
    low: float | None = None
    high: float | None = None
    source: SourceOut


class AddressOut(BaseModel):
    line1: str
    city: str
    state: str
    zip: str
    county: str | None
    latitude: float | None
    longitude: float | None


class FactsOut(BaseModel):
    property_type: str | None
    bedrooms: float | None
    bathrooms: float | None
    square_feet: float | None
    year_built: int | None
    last_sale_price: float | None
    last_sale_date: str | None


class ComparableOut(BaseModel):
    address: str
    price: float
    bedrooms: float | None
    bathrooms: float | None
    square_feet: float | None
    distance_miles: float | None
    days_old: int | None


class LookupResult(BaseModel):
    address: AddressOut
    facts: FactsOut
    suggestions: dict[str, Suggestion]
    """Keyed by input path, e.g. "operations.monthly_rent"."""
    rent_comparables: list[ComparableOut]
    sale_comparables: list[ComparableOut]
    notes: list[str]


class PlaceOut(BaseModel):
    line1: str
    city: str
    state: str
    zip: str
    label: str
