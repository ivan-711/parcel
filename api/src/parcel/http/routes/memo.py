import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, replace
from datetime import date
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent

from parcel.adapters.anthropic import Writer, WriterError
from parcel.db.models import Plan
from parcel.db.session import db
from parcel.domain import deals, usage
from parcel.domain import memo as memos
from parcel.errors import Problem, not_found
from parcel.http.auth import CurrentPrincipal, Tenant
from parcel.schemas.memo import MemoOut, MemoProblem
from parcel.settings import get_settings

log = structlog.get_logger()
router = APIRouter(prefix="/v1/deals/{deal_id}/memo", tags=["memo"])

UNAVAILABLE = "Memos aren't available right now."


@router.get("")
async def get_memo(deal_id: uuid.UUID, session: Tenant) -> MemoOut:
    deal = await deals.get(session, deal_id)
    memo = await memos.latest(session, deal.id)
    if memo is None:
        raise not_found("No memo has been written for this deal yet")
    return memos.to_out(memo, memos.scenario_hash(deal))


@dataclass(frozen=True)
class Job:
    deal_id: uuid.UUID
    owner_id: uuid.UUID
    scenario: str
    cached: MemoOut | None = None
    brief: memos.Brief | None = None


async def start(deal_id: uuid.UUID, request: Request, principal: CurrentPrincipal) -> Job:
    """Everything that can refuse the request, done before the stream opens.

    Runs in its own short transaction so a slow model call never holds a
    database connection.
    """
    settings = get_settings()
    async with db.as_user(principal.user_id) as session:
        deal = await deals.get(session, deal_id)
        scenario = memos.scenario_hash(deal)
        job = Job(deal_id=deal.id, owner_id=deal.owner_id, scenario=scenario)
        existing = await memos.latest(session, deal.id)
        if existing is not None and existing.scenario_hash == scenario:
            return replace(job, cached=memos.to_out(existing, scenario))
        if request.app.state.writer is None:
            raise Problem(503, "memo_unavailable", UNAVAILABLE)
        pro = principal.plan is Plan.pro
        limit = settings.memos_per_day_pro if pro else settings.memos_per_day_free
        today = date.today()
        if not await usage.take(session, f"memo:{principal.user_id}", today, limit):
            detail = f"That's all {limit} memos for today."
            raise Problem(429, "memo_limit", detail if pro else f"{detail} Pro raises the limit.")
        if not await usage.take(session, "memo:all", today, settings.memo_daily_budget):
            raise Problem(429, "memo_budget", "Memo writing is paused until tomorrow.")
        return replace(job, brief=memos.brief(deal))


@router.post(
    "",
    response_class=EventSourceResponse,
    responses={
        200: {
            "description": (
                "A stream of events: `draft` carries a piece of text, `retry` means the "
                "draft is being rewritten and should be cleared, `done` carries the saved "
                "memo, and `error` ends the stream without one."
            )
        }
    },
)
async def write_memo(
    job: Annotated[Job, Depends(start)], request: Request
) -> AsyncIterator[ServerSentEvent]:
    if job.cached is not None:
        yield ServerSentEvent(event="done", data=job.cached)
        return
    assert job.brief is not None
    writer: Writer = request.app.state.writer
    try:
        async for step in memos.compose(writer, job.brief):
            match step:
                case memos.Chunk(text=text):
                    yield ServerSentEvent(event="draft", data={"text": text})
                case memos.Retry(unmatched=unmatched):
                    yield ServerSentEvent(event="retry", data={"unmatched": unmatched})
                case memos.Finished():
                    async with db.as_user(job.owner_id) as session:
                        saved = await memos.save(
                            session,
                            deal_id=job.deal_id,
                            owner_id=job.owner_id,
                            scenario=job.scenario,
                            model=writer.model,
                            finished=step,
                        )
                    log.info("memo_written", deal=str(job.deal_id), grounded=saved.grounded)
                    yield ServerSentEvent(event="done", data=memos.to_out(saved, job.scenario))
    except WriterError as e:
        if e.retryable:
            log.warning("memo_failed", deal=str(job.deal_id), retryable=True, error=str(e))
            failure = MemoProblem(
                code="memo_failed", title="The memo couldn't be written. Try again in a minute."
            )
        else:
            # A rejected key, no credit or an unknown model: asking again won't help,
            # so say memos are off rather than inviting a retry.
            log.error("memo_failed", deal=str(job.deal_id), retryable=False, error=str(e))
            failure = MemoProblem(code="memo_unavailable", title=UNAVAILABLE)
        yield ServerSentEvent(event="error", data=failure)
