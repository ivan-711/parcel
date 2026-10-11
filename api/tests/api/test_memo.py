import json
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from ..writer import FakeWriter
from .conftest import Login, OverrideSettings, deal_body

GOOD = "## Summary\nA $250,000 rental that rents for $2,000 a month."
BAD = "## Summary\nA $250,000 rental with a 19.5% IRR."


@pytest.fixture
def me(login: Login) -> dict[str, str]:
    return login("analyst")


async def _deal(client: httpx.AsyncClient, headers: dict[str, str]) -> str:
    response = await client.post("/v1/deals", json=deal_body(), headers=headers)
    deal_id: str = response.json()["id"]
    return deal_id


def _events(response: httpx.Response) -> list[tuple[str, Any]]:
    events = []
    for block in response.text.strip().split("\n\n"):
        fields = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        if "event" in fields:
            events.append((fields["event"], json.loads(fields["data"])))
    return events


async def _write(
    client: httpx.AsyncClient, headers: dict[str, str], deal_id: str
) -> httpx.Response:
    return await client.post(f"/v1/deals/{deal_id}/memo", headers=headers)


async def test_a_memo_streams_in_and_is_saved(
    client: httpx.AsyncClient, me: dict[str, str], writer: FakeWriter
) -> None:
    deal_id = await _deal(client, me)
    writer.drafts = [GOOD]
    response = await _write(client, me, deal_id)
    assert response.headers["content-type"].startswith("text/event-stream")
    events = _events(response)
    kinds = [kind for kind, _ in events]
    assert kinds[:-1] == ["draft"] * (len(kinds) - 1)
    assert "".join(data["text"] for kind, data in events if kind == "draft") == GOOD
    done = events[-1][1]
    assert done["body"] == GOOD
    assert (done["grounded"], done["unmatched"], done["stale"]) == (True, [], False)

    saved = (await client.get(f"/v1/deals/{deal_id}/memo", headers=me)).json()
    assert saved == done
    assert "Purchase price: $250,000" in writer.calls[0][0][1]


async def test_an_unchanged_deal_reuses_its_memo_for_free(
    client: httpx.AsyncClient,
    me: dict[str, str],
    writer: FakeWriter,
    settings_override: OverrideSettings,
) -> None:
    settings_override(MEMOS_PER_DAY_FREE="1")
    deal_id = await _deal(client, me)
    writer.drafts = [GOOD]
    first = _events(await _write(client, me, deal_id))[-1][1]
    again = _events(await _write(client, me, deal_id))
    assert again == [("done", first)]
    assert len(writer.calls) == 1


async def test_editing_the_deal_makes_the_memo_stale(
    client: httpx.AsyncClient, me: dict[str, str], writer: FakeWriter
) -> None:
    deal_id = await _deal(client, me)
    writer.drafts = [GOOD, GOOD]
    await _write(client, me, deal_id)
    await client.patch(f"/v1/deals/{deal_id}", json={"name": "Duplex, renamed"}, headers=me)
    assert (await client.get(f"/v1/deals/{deal_id}/memo", headers=me)).json()["stale"] is True

    rewritten = _events(await _write(client, me, deal_id))[-1][1]
    assert rewritten["stale"] is False
    assert len(writer.calls) == 2


async def test_a_draft_with_invented_numbers_is_rewritten(
    client: httpx.AsyncClient, me: dict[str, str], writer: FakeWriter
) -> None:
    deal_id = await _deal(client, me)
    writer.drafts = [BAD, GOOD]
    events = _events(await _write(client, me, deal_id))
    assert ("retry", {"unmatched": ["19.5%"]}) in events
    assert events[-1][1]["grounded"] is True


async def test_a_memo_that_never_holds_up_is_saved_with_a_warning(
    client: httpx.AsyncClient, me: dict[str, str], writer: FakeWriter
) -> None:
    deal_id = await _deal(client, me)
    writer.drafts = [BAD, BAD]
    done = _events(await _write(client, me, deal_id))[-1][1]
    assert (done["grounded"], done["unmatched"]) == (False, ["19.5%"])


async def test_the_daily_memo_limit(
    client: httpx.AsyncClient,
    me: dict[str, str],
    writer: FakeWriter,
    settings_override: OverrideSettings,
) -> None:
    settings_override(MEMOS_PER_DAY_FREE="1")
    first, second = await _deal(client, me), await _deal(client, me)
    writer.drafts = [GOOD]
    await _write(client, me, first)
    response = await _write(client, me, second)
    assert response.status_code == 429
    assert response.json()["code"] == "memo_limit"
    assert "Pro" in response.json()["title"]


async def test_the_shared_daily_budget(
    client: httpx.AsyncClient,
    me: dict[str, str],
    writer: FakeWriter,
    settings_override: OverrideSettings,
) -> None:
    settings_override(MEMO_DAILY_BUDGET="0")
    response = await _write(client, me, await _deal(client, me))
    assert response.status_code == 429
    assert response.json()["code"] == "memo_budget"
    assert writer.calls == []


async def test_a_model_outage_ends_the_stream_cleanly(
    client: httpx.AsyncClient, me: dict[str, str], writer: FakeWriter
) -> None:
    deal_id = await _deal(client, me)
    writer.fail = True
    events = _events(await _write(client, me, deal_id))
    assert [kind for kind, _ in events] == ["error"]
    assert events[0][1]["code"] == "memo_failed"
    assert (await client.get(f"/v1/deals/{deal_id}/memo", headers=me)).status_code == 404


async def test_memos_are_off_without_a_model_key(
    app: FastAPI, client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    app.state.writer = None
    response = await _write(client, me, await _deal(client, me))
    assert response.status_code == 503
    assert response.json()["code"] == "memo_unavailable"


async def test_another_users_deal_has_no_memo_to_read_or_write(
    client: httpx.AsyncClient, me: dict[str, str], login: Login, writer: FakeWriter
) -> None:
    deal_id = await _deal(client, me)
    writer.drafts = [GOOD]
    await _write(client, me, deal_id)
    stranger = login("stranger")
    assert (await _write(client, stranger, deal_id)).status_code == 404
    assert (await client.get(f"/v1/deals/{deal_id}/memo", headers=stranger)).status_code == 404
