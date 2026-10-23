from collections.abc import AsyncIterator, Sequence
from typing import Literal, Protocol

from anthropic import (
    APIError,
    AsyncAnthropic,
    AuthenticationError,
    BadRequestError,
    DefaultAsyncHttpxClient,
    NotFoundError,
    PermissionDeniedError,
    UnprocessableEntityError,
)
from anthropic.types import MessageParam

type Turn = tuple[Literal["user", "assistant"], str]

LASTING = (
    AuthenticationError,
    PermissionDeniedError,
    NotFoundError,
    BadRequestError,
    UnprocessableEntityError,
)
"""Refusals that repeat on every call until someone changes the setup: a key that
was rejected, an account out of credit, a model name the API doesn't know.
Rate limits, overloads, server errors and dropped connections pass with time."""


class WriterError(Exception):
    def __init__(self, message: str, *, retryable: bool = True) -> None:
        super().__init__(message)
        self.retryable = retryable


class Writer(Protocol):
    model: str

    def stream(self, system: str, turns: Sequence[Turn]) -> AsyncIterator[str]: ...


class ClaudeWriter:
    def __init__(
        self,
        api_key: str,
        model: str,
        *,
        max_tokens: int = 1_500,
        http: DefaultAsyncHttpxClient | None = None,
    ) -> None:
        self.client = AsyncAnthropic(api_key=api_key, max_retries=2, timeout=60, http_client=http)
        self.model = model
        self.max_tokens = max_tokens

    async def stream(self, system: str, turns: Sequence[Turn]) -> AsyncIterator[str]:
        messages: list[MessageParam] = [{"role": role, "content": text} for role, text in turns]
        try:
            async with self.client.messages.stream(
                model=self.model,
                max_tokens=self.max_tokens,
                system=system,
                messages=messages,
            ) as response:
                async for text in response.text_stream:
                    yield text
        except APIError as e:
            raise WriterError(str(e), retryable=not isinstance(e, LASTING)) from e
