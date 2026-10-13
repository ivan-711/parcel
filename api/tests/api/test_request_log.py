import json
import secrets
from collections.abc import Iterator

import httpx
import pytest
import sentry_sdk
import structlog
from fastapi import FastAPI
from sentry_sdk.types import Event
from structlog.testing import capture_logs
from structlog.typing import EventDict

from parcel import app as app_module
from parcel.app import create_app
from parcel.redact import scrub_event
from parcel.settings import get_settings

from .conftest import Login, deal_body

TOKEN = "SECRETtoken_abcdefghijklmnopqrstuvwxyz0123456"


@pytest.fixture
def logged(app: FastAPI, monkeypatch: pytest.MonkeyPatch) -> Iterator[list[EventDict]]:  # noqa: ARG001
    # Building the app reconfigures structlog, which would discard a capture started earlier, so
    # this depends on it. The app's logger also caches its processors on first use, so give it a
    # fresh one.
    monkeypatch.setattr(app_module, "log", structlog.get_logger())
    with capture_logs(processors=[structlog.contextvars.merge_contextvars]) as entries:
        yield entries


def requests_to(entries: list[EventDict], path: str) -> list[EventDict]:
    return [e for e in entries if e["event"] == "request" and e["path"] == path]


async def test_a_shared_report_is_logged_by_route_and_never_by_token(
    client: httpx.AsyncClient, logged: list[EventDict], login: Login
) -> None:
    me = login("investor")
    deal = (await client.post("/v1/deals", json=deal_body(), headers=me)).json()
    token = (await client.post(f"/v1/deals/{deal['id']}/share", headers=me)).json()["token"]

    shared = await client.get(f"/v1/shared/{token}", headers={"x-request-id": "req-1"})

    assert shared.status_code == 200
    (entry,) = requests_to(logged, "/v1/shared/{token}")
    assert entry["method"] == "GET"
    assert entry["status"] == 200
    assert entry["request_id"] == "req-1"
    assert "ms" in entry
    assert token not in repr(logged)


async def test_an_unknown_share_token_is_not_logged(
    client: httpx.AsyncClient, logged: list[EventDict]
) -> None:
    missing = await client.get(f"/v1/shared/{TOKEN}")

    assert missing.status_code == 404
    assert len(requests_to(logged, "/v1/shared/{token}")) == 1
    assert TOKEN not in repr(logged)


@pytest.mark.parametrize("suffix", ["/", "/extra"])
async def test_unrouted_paths_under_shared_keep_the_token_out_of_the_log(
    client: httpx.AsyncClient, logged: list[EventDict], suffix: str
) -> None:
    await client.get(f"/v1/shared/{TOKEN}{suffix}")

    assert len(requests_to(logged, "/v1/shared/{token}" + suffix)) == 1
    assert TOKEN not in repr(logged)


async def test_other_routes_log_their_template(
    client: httpx.AsyncClient, logged: list[EventDict], login: Login
) -> None:
    me = login("investor")
    deal = (await client.post("/v1/deals", json=deal_body(), headers=me)).json()

    await client.get(f"/v1/deals/{deal['id']}", headers=me)
    await client.get("/nowhere")

    assert len(requests_to(logged, "/v1/deals/{deal_id}")) == 1
    assert len(requests_to(logged, "/nowhere")) == 1
    assert deal["id"] not in repr(logged)


def test_sentry_events_lose_the_share_token() -> None:
    event: Event = {
        "transaction": f"/v1/shared/{TOKEN}/extra",
        "request": {
            "url": f"https://api.parceldesk.io/v1/shared/{TOKEN}?v=1",
            "headers": {"Host": "api.parceldesk.io"},
        },
        "exception": {
            "values": [
                {"stacktrace": {"frames": [{"vars": {"raw_path": f"b'/v1/shared/{TOKEN}'"}}]}}
            ]
        },
    }

    cleaned = scrub_event(event, {})

    assert TOKEN not in json.dumps(cleaned)
    assert cleaned["request"]["url"] == "https://api.parceldesk.io/v1/shared/{token}?v=1"
    assert cleaned["request"]["headers"] == {"Host": "api.parceldesk.io"}


def test_a_share_token_is_scrubbed_wherever_it_turns_up() -> None:
    token = secrets.token_urlsafe(32)
    event = {
        "exception": {
            "values": [
                {
                    "value": (
                        "(asyncpg.exceptions.ConnectionDoesNotExistError) connection was closed\n"
                        "[SQL: SELECT deals.id FROM deals WHERE deals.share_token = $1::VARCHAR]\n"
                        f"[parameters: ('{token}',)]"
                    )
                }
            ]
        },
        "breadcrumbs": {"values": [{"message": f"share token {token} looked up"}]},
    }

    cleaned = scrub_event(event, {})  # type: ignore[arg-type]

    assert token not in json.dumps(cleaned)
    assert "[parameters: ('{token}',)]" in cleaned["exception"]["values"][0]["value"]


def test_sentry_is_started_with_the_scrubber(monkeypatch: pytest.MonkeyPatch) -> None:
    options: dict[str, object] = {}
    monkeypatch.setattr(sentry_sdk, "init", lambda **kwargs: options.update(kwargs))

    create_app(get_settings().model_copy(update={"sentry_dsn": "https://k@o0.ingest.sentry.io/0"}))

    assert options["before_send"] is scrub_event
    assert options["before_send_transaction"] is scrub_event
    assert options["include_local_variables"] is False
