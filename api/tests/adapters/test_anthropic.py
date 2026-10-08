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
    def handler(_: httpx2.Request) -> httpx2.Response:
        error = {"type": "invalid_request_error", "message": "bad model"}
        return httpx2.Response(400, json={"type": "error", "error": error})

    with pytest.raises(WriterError):
        [t async for t in _writer(handler).stream("s", [("user", "hi")])]
