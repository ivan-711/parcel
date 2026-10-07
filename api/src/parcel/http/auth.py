import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from parcel.adapters.clerk import ClerkVerifier, InvalidToken
from parcel.db.models import Plan
from parcel.db.session import db
from parcel.domain import users
from parcel.errors import Problem
from parcel.settings import get_settings

DEMO_ISSUER = "parcel-demo"


@dataclass(frozen=True)
class Principal:
    user_id: uuid.UUID
    plan: Plan
    is_demo: bool

    @property
    def is_pro(self) -> bool:
        return self.plan is Plan.pro or self.is_demo


def demo_token(user_id: uuid.UUID, expires_at: datetime) -> str:
    claims = {"iss": DEMO_ISSUER, "sub": str(user_id), "exp": expires_at, "iat": datetime.now(UTC)}
    return jwt.encode(claims, get_settings().secret_key.get_secret_value(), algorithm="HS256")


def _bearer(request: Request) -> str:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise Problem(401, "unauthenticated", "Sign in to continue.")
    return token


def _demo_user_id(token: str) -> uuid.UUID | None:
    try:
        unverified = jwt.decode(token, options={"verify_signature": False})
    except jwt.PyJWTError:
        return None
    if unverified.get("iss") != DEMO_ISSUER:
        return None
    try:
        claims = jwt.decode(
            token,
            get_settings().secret_key.get_secret_value(),
            algorithms=["HS256"],
            issuer=DEMO_ISSUER,
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as e:
        raise Problem(401, "demo_expired", "This demo session has ended. Start a new one.") from e
    return uuid.UUID(claims["sub"])


async def current_principal(request: Request) -> Principal:
    token = _bearer(request)
    demo_id = _demo_user_id(token)
    async with db.as_system() as session:
        if demo_id is not None:
            user = await users.get_active(session, demo_id)
            if user is None:
                raise Problem(401, "demo_expired", "This demo session has ended. Start a new one.")
        else:
            verifier: ClerkVerifier = request.app.state.clerk
            try:
                identity = await verifier.verify(token)
            except InvalidToken as e:
                raise Problem(
                    401, "unauthenticated", "Your session is invalid. Sign in again."
                ) from e
            user = await users.provision(session, identity)
        return Principal(user_id=user.id, plan=user.plan, is_demo=user.is_demo)


CurrentPrincipal = Annotated[Principal, Depends(current_principal)]


async def tenant_session(principal: CurrentPrincipal) -> AsyncIterator[AsyncSession]:
    async with db.as_user(principal.user_id) as session:
        yield session


Tenant = Annotated[AsyncSession, Depends(tenant_session)]


def demo_expiry() -> datetime:
    return datetime.now(UTC) + timedelta(hours=get_settings().demo_ttl_hours)
