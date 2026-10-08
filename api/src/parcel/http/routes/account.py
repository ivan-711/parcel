from datetime import UTC, date, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from sqlalchemy import text

from parcel.db.models import User
from parcel.db.session import db
from parcel.domain import demo, usage
from parcel.errors import Problem
from parcel.http.auth import CurrentPrincipal, Tenant, demo_token
from parcel.settings import get_settings

router = APIRouter(prefix="/v1", tags=["account"])


class Me(BaseModel):
    id: str
    email: str | None
    name: str | None
    plan: str
    is_demo: bool
    demo_expires_at: datetime | None
    defaults: dict[str, Any]


class MeUpdate(BaseModel):
    name: Annotated[str, Field(max_length=200)] | None = None
    defaults: dict[str, float] | None = None


def _me(user: User) -> Me:
    return Me(
        id=str(user.id),
        email=user.email,
        name=user.name,
        plan=user.plan.value,
        is_demo=user.is_demo,
        demo_expires_at=user.demo_expires_at,
        defaults=user.defaults,
    )


@router.get("/me")
async def me(principal: CurrentPrincipal, session: Tenant) -> Me:
    user = await session.get(User, principal.user_id)
    assert user is not None
    return _me(user)


@router.patch("/me")
async def update_me(data: MeUpdate, principal: CurrentPrincipal, session: Tenant) -> Me:
    user = await session.get(User, principal.user_id)
    assert user is not None
    if data.name is not None:
        user.name = data.name
    if data.defaults is not None:
        user.defaults = data.defaults
    await session.flush()
    return _me(user)


class DemoSession(BaseModel):
    token: str
    expires_at: datetime


@router.post("/demo", status_code=201)
async def start_demo(request: Request) -> DemoSession:
    settings = get_settings()
    ip = request.client.host if request.client else "unknown"
    expires_at = demo.ttl(settings.demo_ttl_hours)
    async with db.as_system() as session:
        if not await usage.take(session, f"demo:{ip}", date.today(), settings.demos_per_ip_per_day):
            raise Problem(
                429, "demo_limit", "That's a lot of demos for one day. Try again tomorrow."
            )
        await demo.remove_expired(session)
        user = await demo.create_sandbox(session, expires_at)
    return DemoSession(token=demo_token(user.id, expires_at), expires_at=expires_at)


health = APIRouter(tags=["health"])


@health.get("/healthz", include_in_schema=False)
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@health.get("/readyz", include_in_schema=False)
async def readyz() -> dict[str, str]:
    async with db.sessions() as session:
        await session.execute(text("select 1"))
    return {"status": "ready", "time": datetime.now(UTC).isoformat()}
