import asyncio
import time
import uuid
from typing import Any

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from parcel.adapters.clerk import ClerkVerifier, InvalidToken, KeysUnavailable

ISSUER = "https://clerk.example"


class Clerk:
    """A stand in whose key fetch yields, the way a real one does on the network."""

    def __init__(self) -> None:
        self.kid = uuid.uuid4().hex[:12]
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.fetches = 0
        self.down = False
        self.verifier = ClerkVerifier(
            ISSUER, [], httpx.AsyncClient(transport=httpx.MockTransport(self))
        )

    async def __call__(self, _request: httpx.Request) -> httpx.Response:
        self.fetches += 1
        await asyncio.sleep(0)
        if self.down:
            return httpx.Response(503)
        jwk: dict[str, Any] = jwt.algorithms.RSAAlgorithm.to_jwk(
            self.key.public_key(), as_dict=True
        )
        return httpx.Response(200, json={"keys": [{**jwk, "kid": self.kid, "alg": "RS256"}]})

    def token(self) -> str:
        now = int(time.time())
        claims = {"sub": "user_a", "iss": ISSUER, "iat": now, "exp": now + 300}
        return jwt.encode(claims, self.key, algorithm="RS256", headers={"kid": self.kid})

    async def outcome(self) -> int:
        try:
            await self.verifier.verify(self.token())
        except InvalidToken:
            return 401
        except KeysUnavailable:
            return 503
        return 200


@pytest.fixture
def clerk() -> Clerk:
    return Clerk()


async def test_tokens_arriving_during_the_first_fetch_wait_for_it(clerk: Clerk) -> None:
    assert await asyncio.gather(*(clerk.outcome() for _ in range(5))) == [200] * 5
    assert clerk.fetches == 1


async def test_no_keys_is_an_outage_for_everyone_until_the_next_try(clerk: Clerk) -> None:
    clerk.down = True
    assert await clerk.outcome() == 503
    assert await clerk.outcome() == 503
    assert clerk.fetches == 1
    clerk.down = False
    clerk.verifier.min_refresh_gap = 0
    assert await clerk.outcome() == 200
