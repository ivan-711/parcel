from typing import Protocol

import stripe
from stripe.params.checkout import SessionCreateParams


class Billing(Protocol):
    async def checkout_url(
        self, *, user_id: str, email: str | None, customer_id: str | None, return_to: str
    ) -> str: ...

    async def portal_url(self, *, customer_id: str, return_to: str) -> str: ...


class StripeBilling:
    def __init__(self, secret_key: str, price_id: str) -> None:
        self.client = stripe.StripeClient(secret_key)
        self.price_id = price_id

    async def checkout_url(
        self, *, user_id: str, email: str | None, customer_id: str | None, return_to: str
    ) -> str:
        params: SessionCreateParams = {
            "mode": "subscription",
            "line_items": [{"price": self.price_id, "quantity": 1}],
            "client_reference_id": user_id,
            "metadata": {"user_id": user_id},
            "subscription_data": {"metadata": {"user_id": user_id}},
            "success_url": f"{return_to}?upgraded=1",
            "cancel_url": return_to,
            "allow_promotion_codes": True,
        }
        if customer_id:
            params["customer"] = customer_id
        elif email:
            params["customer_email"] = email
        session = await self.client.v1.checkout.sessions.create_async(params=params)
        assert session.url is not None
        return session.url

    async def portal_url(self, *, customer_id: str, return_to: str) -> str:
        session = await self.client.v1.billing_portal.sessions.create_async(
            params={"customer": customer_id, "return_url": return_to}
        )
        return session.url
