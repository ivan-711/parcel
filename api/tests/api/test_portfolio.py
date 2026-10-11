import asyncio
import uuid
from datetime import date
from typing import Any

import httpx
import pytest
from sqlalchemy import select

from parcel.db.models import Actual
from parcel.db.session import db
from parcel.domain import deals

from .conftest import Login, deal_body


def _months_ago(n: int) -> date:
    today = date.today().replace(day=1)
    total = today.year * 12 + today.month - 1 - n
    return date(total // 12, total % 12 + 1, 1)


async def test_actuals_line_up_against_the_projection(
    client: httpx.AsyncClient, login: Login
) -> None:
    me = login("landlord")
    deal = (
        await client.post("/v1/deals", json={**deal_body(), "stage": "owned"}, headers=me)
    ).json()
    await client.patch(
        f"/v1/deals/{deal['id']}", json={"acquired_on": _months_ago(3).isoformat()}, headers=me
    )
    actual = {"rent_collected": 2_000, "operating_expenses": 500, "debt_service": 1_247.44}
    put = await client.put(
        f"/v1/deals/{deal['id']}/actuals/{_months_ago(2).isoformat()}", json=actual, headers=me
    )
    assert put.status_code == 200

    portfolio = (await client.get("/v1/portfolio", headers=me)).json()
    [prop] = portfolio["properties"]
    assert len(prop["months"]) == 3
    recorded = [m for m in prop["months"] if m["actual_cash_flow"] is not None]
    assert recorded == [
        {
            "month": _months_ago(2).isoformat(),
            "projected_cash_flow": prop["months"][0]["projected_cash_flow"],
            "actual_cash_flow": 252.56,
            "actual": {**actual, "capital_spent": 0, "note": ""},
        }
    ]
    assert portfolio["actual_to_date"] == 252.56
    planned = prop["months"][0]["projected_cash_flow"]
    assert prop["variance_to_date"] == round(252.56 - planned, 2)
    assert portfolio["variance_to_date"] == prop["variance_to_date"]
    assert portfolio["variance_rate"] == round((252.56 - planned) / abs(planned), 4)


async def test_removing_a_month(client: httpx.AsyncClient, login: Login) -> None:
    me = login("landlord")
    deal = (
        await client.post("/v1/deals", json={**deal_body(), "stage": "owned"}, headers=me)
    ).json()
    month = date.today().replace(day=1).isoformat()
    actual = {"rent_collected": 1, "operating_expenses": 1, "debt_service": 1}
    await client.put(f"/v1/deals/{deal['id']}/actuals/{month}", json=actual, headers=me)
    assert (
        await client.delete(f"/v1/deals/{deal['id']}/actuals/{month}", headers=me)
    ).status_code == 204
    assert (
        await client.delete(f"/v1/deals/{deal['id']}/actuals/{month}", headers=me)
    ).status_code == 404


async def test_a_property_bought_this_month_still_quotes_its_plan(
    client: httpx.AsyncClient, login: Login
) -> None:
    me = login("landlord")
    await client.post("/v1/deals", json={**deal_body(), "stage": "owned"}, headers=me)

    portfolio = (await client.get("/v1/portfolio", headers=me)).json()
    [prop] = portfolio["properties"]
    assert prop["months"] == []
    assert portfolio["monthly_projected_now"] != 0


async def test_a_sold_property_stops_counting_its_sale_as_income(
    client: httpx.AsyncClient, login: Login
) -> None:
    me = login("landlord")
    deal = (
        await client.post(
            "/v1/deals", json={**deal_body(hold_years=1), "stage": "owned"}, headers=me
        )
    ).json()
    await client.patch(
        f"/v1/deals/{deal['id']}", json={"acquired_on": _months_ago(14).isoformat()}, headers=me
    )
    portfolio = (await client.get("/v1/portfolio", headers=me)).json()
    [prop] = portfolio["properties"]
    assert len(prop["months"]) == 12
    assert all(abs(m["projected_cash_flow"]) < 5_000 for m in prop["months"])
    assert portfolio["monthly_projected_now"] == 0


async def test_entering_a_month_again_replaces_it(client: httpx.AsyncClient, login: Login) -> None:
    me = login("landlord")
    deal = (
        await client.post("/v1/deals", json={**deal_body(), "stage": "owned"}, headers=me)
    ).json()
    first = {"rent_collected": 2_000, "operating_expenses": 500, "debt_service": 1_200}
    second = {**first, "rent_collected": 1_900, "capital_spent": 300, "note": "new roof"}
    base = f"/v1/deals/{deal['id']}/actuals"
    await client.put(f"{base}/2026-05-17", json=first, headers=me)
    put = await client.put(f"{base}/2026-05-01", json=second, headers=me)

    assert put.json() == {"month": "2026-05-01", **second}
    async with db.as_system() as session:
        rows = (
            await session.scalars(select(Actual).where(Actual.deal_id == uuid.UUID(deal["id"])))
        ).all()
    assert [(r.month, r.rent_collected, r.capital_spent, r.note) for r in rows] == [
        (date(2026, 5, 1), 1_900, 300, "new roof")
    ]


async def test_two_first_entries_for_a_month_do_not_collide(
    client: httpx.AsyncClient, login: Login, monkeypatch: pytest.MonkeyPatch
) -> None:
    me = login("landlord")
    deal = (
        await client.post("/v1/deals", json={**deal_body(), "stage": "owned"}, headers=me)
    ).json()
    url = f"/v1/deals/{deal['id']}/actuals/{date.today().replace(day=1).isoformat()}"
    first = {"rent_collected": 2_000, "operating_expenses": 500, "debt_service": 1_200}
    second = {**first, "rent_collected": 2_100, "note": "second"}

    # Hold each request until both are about to write, so they overlap for certain.
    both_here = asyncio.Barrier(2)
    write = deals.put_actual

    async def together(*args: Any) -> Actual:
        await both_here.wait()
        return await write(*args)

    monkeypatch.setattr(deals, "put_actual", together)
    async with asyncio.timeout(10):
        puts = await asyncio.gather(
            client.put(url, json=first, headers=me), client.put(url, json=second, headers=me)
        )

    assert [p.status_code for p in puts] == [200, 200]
    async with db.as_system() as session:
        rows = (
            await session.scalars(select(Actual).where(Actual.deal_id == uuid.UUID(deal["id"])))
        ).all()
    assert len(rows) == 1
    assert (rows[0].rent_collected, rows[0].note) in {(2_000, ""), (2_100, "second")}
