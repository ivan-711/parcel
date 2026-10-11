from datetime import date

import httpx

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
