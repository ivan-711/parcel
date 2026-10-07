import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Response

from parcel.db.models import Stage, Strategy
from parcel.db.session import db
from parcel.domain import deals
from parcel.http.auth import CurrentPrincipal, Tenant
from parcel.schemas import deals as schema

router = APIRouter(prefix="/v1", tags=["deals"])


@router.get("/deals")
async def list_deals(
    session: Tenant,
    stage: Stage | None = None,
    strategy: Strategy | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    sort: deals.Sort = "updated",
) -> list[schema.DealOut]:
    found = await deals.list_deals(session, stage=stage, strategy=strategy, query=q, sort=sort)
    return [deals.to_out(d) for d in found]


@router.post("/deals", status_code=201)
async def create_deal(
    data: schema.DealCreate, session: Tenant, principal: CurrentPrincipal
) -> schema.DealDetail:
    deal = await deals.create(session, principal.user_id, data)
    return deals.to_detail(deal)


@router.get("/deals/{deal_id}")
async def get_deal(deal_id: uuid.UUID, session: Tenant, monthly: bool = False) -> schema.DealDetail:
    return deals.to_detail(await deals.get(session, deal_id), monthly=monthly)


@router.patch("/deals/{deal_id}")
async def update_deal(
    deal_id: uuid.UUID, data: schema.DealUpdate, session: Tenant
) -> schema.DealDetail:
    deal = await deals.apply_update(session, await deals.get(session, deal_id), data)
    return deals.to_detail(deal)


@router.delete("/deals/{deal_id}", status_code=204)
async def delete_deal(deal_id: uuid.UUID, session: Tenant) -> Response:
    await session.delete(await deals.get(session, deal_id))
    return Response(status_code=204)


@router.put("/deals/{deal_id}/stage")
async def move_deal(deal_id: uuid.UUID, data: schema.StageMove, session: Tenant) -> schema.DealOut:
    deal = await deals.move(session, await deals.get(session, deal_id), data.stage, data.position)
    return deals.to_out(deal)


@router.post("/deals/{deal_id}/share")
async def share_deal(deal_id: uuid.UUID, session: Tenant) -> schema.ShareLink:
    return schema.ShareLink(token=await deals.share(session, await deals.get(session, deal_id)))


@router.delete("/deals/{deal_id}/share", status_code=204)
async def unshare_deal(deal_id: uuid.UUID, session: Tenant) -> Response:
    await deals.unshare(session, await deals.get(session, deal_id))
    return Response(status_code=204)


@router.get("/compare")
async def compare(
    session: Tenant, ids: Annotated[list[uuid.UUID], Query(min_length=2, max_length=4)]
) -> list[schema.DealDetail]:
    return [deals.to_detail(await deals.get(session, i)) for i in ids]


@router.put("/deals/{deal_id}/actuals/{month}")
async def put_actual(
    deal_id: uuid.UUID, month: date, data: schema.ActualIn, session: Tenant
) -> schema.ActualOut:
    actual = await deals.put_actual(session, await deals.get(session, deal_id), month, data)
    return schema.ActualOut(month=actual.month, **data.model_dump())


@router.delete("/deals/{deal_id}/actuals/{month}", status_code=204)
async def delete_actual(deal_id: uuid.UUID, month: date, session: Tenant) -> Response:
    await deals.delete_actual(session, await deals.get(session, deal_id), month)
    return Response(status_code=204)


@router.get("/portfolio")
async def portfolio(session: Tenant) -> schema.Portfolio:
    return await deals.portfolio(session)


public = APIRouter(prefix="/v1", tags=["sharing"])


@public.get("/shared/{token}")
async def shared_deal(token: str, response: Response) -> schema.SharedDeal:
    async with db.as_system() as session:
        deal = await deals.by_share_token(session, token)
    response.headers["Cache-Control"] = "public, max-age=60"
    response.headers["X-Robots-Tag"] = "noindex"
    return schema.SharedDeal(
        name=deal.name,
        strategy=deal.strategy,
        address=schema.Address(**deal.address) if deal.address else None,
        inputs=deals.parse_inputs(deal.inputs),
        provenance={k: schema.Source(**v) for k, v in deal.provenance.items()},
        analysis=deals.analysis_of(deal, monthly=False),
        updated_at=deal.updated_at,
    )
