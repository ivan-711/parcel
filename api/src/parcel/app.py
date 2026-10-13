import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import httpx
import sentry_sdk
import structlog
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from parcel import logging
from parcel.adapters.anthropic import ClaudeWriter, Writer
from parcel.adapters.billing import Billing, StripeBilling
from parcel.adapters.clerk import ClerkVerifier
from parcel.adapters.fixtures import FixtureData
from parcel.adapters.property_data import LiveData, PropertyData
from parcel.db.session import db
from parcel.errors import Problem
from parcel.http.problems import problem_handler, validation_handler
from parcel.http.routes import account, analyze, deals, lookup, memo
from parcel.http.routes import billing as billing_routes
from parcel.redact import redact_path, scrub_event
from parcel.settings import Settings, get_settings

log = structlog.get_logger()


def create_app(
    settings: Settings | None = None,
    http: httpx.AsyncClient | None = None,
    property_data: PropertyData | None = None,
    billing: Billing | None = None,
    writer: Writer | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    logging.configure(json=settings.log_json)
    if settings.sentry_dsn:
        # A frame's locals can hold a session or share token, and the scrubber only
        # knows the share token's shape.
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            traces_sample_rate=0.1,
            include_local_variables=False,
            before_send=scrub_event,
            before_send_transaction=scrub_event,
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        client = http or httpx.AsyncClient(timeout=httpx.Timeout(10, connect=5))
        app.state.http = client
        app.state.clerk = ClerkVerifier(settings.clerk_issuer, settings.web_origins, client)
        app.state.property_data = property_data or _property_data(settings, client)
        app.state.billing = billing or _billing(settings)
        app.state.writer = writer or _writer(settings)
        yield
        if http is None:
            await client.aclose()
        await db.dispose()

    app = FastAPI(
        title="Parcel API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.web_origins,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["authorization", "content-type"],
        max_age=600,
    )
    app.middleware("http")(_request_context)
    app.add_exception_handler(Problem, problem_handler)
    app.add_exception_handler(RequestValidationError, validation_handler)
    for router in (
        account.health,
        account.router,
        deals.router,
        deals.public,
        analyze.router,
        memo.router,
        lookup.router,
        billing_routes.router,
        billing_routes.webhooks,
    ):
        app.include_router(router)
    return app


async def _request_context(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)
    started = time.perf_counter()
    response = await call_next(request)
    elapsed = (time.perf_counter() - started) * 1000
    response.headers["x-request-id"] = request_id
    response.headers["x-content-type-options"] = "nosniff"
    if request.url.path not in {"/healthz", "/readyz"}:
        log.info(
            "request",
            method=request.method,
            path=_logged_path(request),
            status=response.status_code,
            ms=round(elapsed, 1),
        )
    return response


def _logged_path(request: Request) -> str:
    # Routing has run once the response exists. Unrouted requests (404s, slash redirects) have
    # no template, so their raw path is logged with any share token removed.
    route = request.scope.get("route")
    return route.path if route else redact_path(request.url.path)


def _property_data(settings: Settings, client: httpx.AsyncClient) -> PropertyData:
    if settings.providers == "fixtures":
        return FixtureData()
    return LiveData(
        client,
        rentcast_key=settings.rentcast_api_key.get_secret_value(),
        geoapify_key=settings.geoapify_api_key.get_secret_value(),
        fred_key=settings.fred_api_key.get_secret_value(),
        hud_token=settings.hud_api_token.get_secret_value(),
    )


def _billing(settings: Settings) -> Billing | None:
    key = settings.stripe_secret_key.get_secret_value()
    if not key or not settings.stripe_pro_price_id:
        return None
    return StripeBilling(key, settings.stripe_pro_price_id)


def _writer(settings: Settings) -> Writer | None:
    key = settings.anthropic_api_key.get_secret_value()
    return ClaudeWriter(key, settings.memo_model) if key else None
