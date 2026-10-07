from typing import Any


class Problem(Exception):
    """An error the client can act on, sent as RFC 9457 problem details."""

    def __init__(self, status: int, code: str, detail: str, **extra: Any) -> None:
        super().__init__(detail)
        self.status = status
        self.code = code
        self.detail = detail
        self.extra = extra


def not_found(what: str = "Not found") -> Problem:
    return Problem(404, "not_found", what)
