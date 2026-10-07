from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from parcel.errors import Problem


def _response(status: int, body: dict[str, Any]) -> JSONResponse:
    return JSONResponse(body, status_code=status, media_type="application/problem+json")


async def problem_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, Problem)
    return _response(
        exc.status,
        {
            "type": "about:blank",
            "status": exc.status,
            "code": exc.code,
            "title": exc.detail,
            **exc.extra,
        },
    )


async def validation_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    errors = [
        {"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()
    ]
    return _response(
        422,
        {
            "type": "about:blank",
            "status": 422,
            "code": "invalid_input",
            "title": "Some inputs need another look",
            "errors": errors,
        },
    )
