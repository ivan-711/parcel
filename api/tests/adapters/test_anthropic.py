import json
from typing import Any

import httpx2
import pytest
from anthropic import DefaultAsyncHttpxClient

from parcel.adapters.anthropic import ClaudeWriter, WriterError


def _sse(*events: dict[str, Any]) -> bytes:
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events).encode()


STREAM = _sse(
    {
        "type": "message_start",
        "message": {
            "id": "msg_1",
            "type": "message",
            "role": "assistant",
            "model": "claude-test",
            "content": [],
            "stop_reason": None,
            "stop_sequence": None,
            "usage": {"input_tokens": 120, "output_tokens": 1},
        },
    },
    {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
    {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "## Sum"}},
    {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "mary"}},
    {"type": "content_block_stop", "index": 0},
    {
        "type": "message_delta",
        "delta": {"stop_reason": "end_turn", "stop_sequence": None},
        "usage": {"output_tokens": 4},
    },
    {"type": "message_stop"},
)


def _writer(handler: Any) -> ClaudeWriter:
    http = DefaultAsyncHttpxClient(transport=httpx2.MockTransport(handler))
    return ClaudeWriter("sk-test", "claude-test", http=http)


async def test_text_arrives_piece_by_piece() -> None:
    sent: list[dict[str, Any]] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        sent.append(json.loads(request.content))
        return httpx2.Response(200, content=STREAM, headers={"content-type": "text/event-stream"})

    writer = _writer(handler)
    turns = [("user", "Figures: ..."), ("assistant", "draft"), ("user", "fix it")]
    pieces = [t async for t in writer.stream("Be careful.", turns)]  # type: ignore[arg-type]
    assert pieces == ["## Sum", "mary"]
    body = sent[0]
    assert (body["model"], body["system"], body["stream"]) == ("claude-test", "Be careful.", True)
    assert [m["role"] for m in body["messages"]] == ["user", "assistant", "user"]


async def test_an_api_error_becomes_a_writer_error() -> None:
    def refused(_: httpx2.Request) -> httpx2.Response:
        error = {"type": "invalid_request_error", "message": "bad model"}
        return httpx2.Response(400, json={"type": "error", "error": error})

    with pytest.raises(WriterError) as refusal:
        [t async for t in _writer(refused).stream("s", [("user", "hi")])]
    assert not refusal.value.retryable

    def overloaded(_: httpx2.Request) -> httpx2.Response:
        error = {"type": "overloaded_error", "message": "Overloaded"}
        # The header turns off the SDK's own retries, so the test doesn't sit through them.
        headers = {"x-should-retry": "false"}
        return httpx2.Response(529, json={"type": "error", "error": error}, headers=headers)

    with pytest.raises(WriterError) as outage:
        [t async for t in _writer(overloaded).stream("s", [("user", "hi")])]
    assert outage.value.retryable

    # An error partway through a stream arrives on a 200 response, so it is judged
    # by its kind of exception, not its status code.
    overload = {"type": "error", "error": {"type": "overloaded_error", "message": "Overloaded"}}
    cut_off = STREAM.split(b"event: content_block_stop")[0] + _sse(overload)

    def midway(_: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, content=cut_off, headers={"content-type": "text/event-stream"})

    with pytest.raises(WriterError) as dropped:
        [t async for t in _writer(midway).stream("s", [("user", "hi")])]
    assert dropped.value.retryable
