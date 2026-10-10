import time
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
import structlog

log = structlog.get_logger()

_JWKS_TTL = 3600


class InvalidToken(Exception):
    pass


class KeysUnavailable(Exception):
    """Clerk's signing keys could not be fetched and none are cached."""


@dataclass(frozen=True)
class Identity:
    clerk_id: str
    email: str | None
    name: str | None


class ClerkVerifier:
    """Verifies Clerk session tokens against the instance's published signing keys.

    Keys are cached for an hour. A token signed with a key we haven't seen
    triggers one refetch, which is how a key rotation gets picked up without a
    restart. If Clerk can't be reached, the cached keys stay in use.
    """

    min_refresh_gap = 30.0
    """Seconds between forced refreshes, so a stream of bad tokens can't hammer Clerk."""

    def __init__(
        self, issuer: str, authorized_parties: list[str], client: httpx.AsyncClient
    ) -> None:
        self.issuer = issuer.rstrip("/")
        self.authorized_parties = set(authorized_parties)
        self.client = client
        self._keys: dict[str, Any] = {}
        self._fetched_at = 0.0
        self._tried_at = 0.0

    async def verify(self, token: str) -> Identity:
        if not self.issuer:
            raise InvalidToken("accounts are turned off on this server")
        try:
            kid = jwt.get_unverified_header(token).get("kid")
        except jwt.PyJWTError as e:
            raise InvalidToken("malformed token") from e
        key = await self._key(kid)
        try:
            claims = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                issuer=self.issuer,
                options={"require": ["exp", "iat", "sub", "iss"]},
                leeway=5,
            )
        except jwt.PyJWTError as e:
            raise InvalidToken(str(e)) from e
        azp = claims.get("azp")
        if azp is not None and self.authorized_parties and azp not in self.authorized_parties:
            raise InvalidToken("token was issued for a different origin")
        return Identity(clerk_id=claims["sub"], email=claims.get("email"), name=claims.get("name"))

    async def _key(self, kid: str | None) -> Any:
        if kid is None:
            raise InvalidToken("token has no key id")
        stale = time.monotonic() - self._fetched_at > _JWKS_TTL
        if (stale or kid not in self._keys) and self._may_refresh():
            await self._refresh()
        if kid not in self._keys:
            raise InvalidToken("token was signed with an unknown key")
        return self._keys[kid]

    def _may_refresh(self) -> bool:
        return time.monotonic() - self._tried_at > self.min_refresh_gap

    async def _refresh(self) -> None:
        self._tried_at = time.monotonic()
        try:
            response = await self.client.get(f"{self.issuer}/.well-known/jwks.json", timeout=5)
            response.raise_for_status()
            keys = {jwk["kid"]: jwt.PyJWK(jwk).key for jwk in response.json().get("keys", [])}
        except (httpx.HTTPError, ValueError, KeyError, jwt.PyJWTError) as e:
            if self._keys:
                log.warning("jwks_refresh_failed", error=str(e))
                return
            raise KeysUnavailable(str(e)) from e
        self._keys = keys
        self._fetched_at = self._tried_at
