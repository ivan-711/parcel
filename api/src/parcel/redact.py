import re
from typing import Any, cast

from sentry_sdk.types import Event, Hint

# Shared report links carry the token in the path, and the token alone opens the report.
_SHARED = re.compile(r"(/v1/shared/)[\w-]+")


def redact_path(text: str) -> str:
    return _SHARED.sub(r"\1{token}", text)


def scrub_event(event: Event, _hint: Hint) -> Event:
    return cast(Event, _scrub(event))


def _scrub(node: Any) -> Any:
    if isinstance(node, str):
        return redact_path(node)
    if isinstance(node, dict):
        return {key: _scrub(value) for key, value in node.items()}
    if isinstance(node, list):
        return [_scrub(item) for item in node]
    return node
