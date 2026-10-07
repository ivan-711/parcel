from typing import Annotated

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, StringConstraints

from parcel.adapters.fixtures import FixtureData
from parcel.adapters.property_data import PropertyData, ProviderError
from parcel.db.session import db
from parcel.domain.lookup import Budget, lookup
from parcel.http.auth import CurrentPrincipal
from parcel.schemas.lookup import LookupResult, PlaceOut
from parcel.settings import get_settings

router = APIRouter(prefix="/v1/lookup", tags=["lookup"])


def _source(request: Request, sample: bool) -> PropertyData:
    if sample:
        return FixtureData()
    data: PropertyData = request.app.state.property_data
    return data


@router.get("/autocomplete")
async def autocomplete(
    request: Request,
    principal: CurrentPrincipal,
    q: Annotated[str, Query(min_length=3, max_length=120)],
) -> list[PlaceOut]:
    try:
        places = await _source(request, principal.is_demo).autocomplete(q)
    except ProviderError:
        return []
    return [
        PlaceOut(line1=p.line1, city=p.city, state=p.state, zip=p.zip, label=p.one_line)
        for p in places
    ]


class LookupRequest(BaseModel):
    address: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=200)]


@router.post("")
async def property_lookup(
    data: LookupRequest, request: Request, principal: CurrentPrincipal
) -> LookupResult:
    settings = get_settings()
    budget = Budget(
        user_key=f"lookup:{principal.user_id}",
        per_user_per_day=settings.lookups_per_user_per_day,
        per_month=settings.rentcast_monthly_budget,
    )
    async with db.as_system() as session:
        return await lookup(
            session,
            _source(request, principal.is_demo),
            data.address,
            budget,
            sample_data=principal.is_demo,
        )
