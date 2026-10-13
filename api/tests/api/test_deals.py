import uuid
from datetime import date

import httpx
import pytest
from sqlalchemy import text

from parcel.db.session import db
from parcel.domain.analysis import analyze
from parcel.schemas.analysis import Analysis
from parcel.schemas.inputs import BuyAndHold

from .conftest import RENTAL, Login, deal_body, migration


@pytest.fixture
def me(login: Login) -> dict[str, str]:
    return login("investor")


async def test_create_returns_the_deal_with_its_analysis(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    response = await client.post("/v1/deals", json=deal_body(), headers=me)
    assert response.status_code == 201
    body = response.json()
    expected = analyze(BuyAndHold.model_validate(RENTAL))
    assert isinstance(expected, Analysis)
    assert body["analysis"]["metrics"] == expected.model_dump()["metrics"]
    assert body["summary"]["irr"] == expected.metrics.irr
    assert body["stage"] == "lead"
    assert len(body["analysis"]["years"]) == 11


async def test_invalid_inputs_come_back_as_field_errors(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    bad = deal_body(price=-5, down_payment_rate=2)
    response = await client.post("/v1/deals", json=bad, headers=me)
    assert response.status_code == 422
    fields = {e["field"] for e in response.json()["errors"]}
    assert {"inputs.buy_and_hold.price", "inputs.buy_and_hold.down_payment_rate"} <= fields


async def test_unknown_inputs_are_refused(client: httpx.AsyncClient, me: dict[str, str]) -> None:
    response = await client.post("/v1/deals", json=deal_body(surprise=1), headers=me)
    assert response.status_code == 422


async def test_list_filters_and_searches(client: httpx.AsyncClient, me: dict[str, str]) -> None:
    await client.post("/v1/deals", json=deal_body("Maple duplex"), headers=me)
    flip = {
        "name": "Oak flip",
        "inputs": {
            "strategy": "flip",
            "price": 100_000,
            "rehab_cost": 30_000,
            "after_repair_value": 180_000,
            "property_tax_annual": 2_000,
            "insurance_annual": 1_000,
        },
    }
    await client.post("/v1/deals", json=flip, headers=me)

    async def names(**params: str) -> list[str]:
        found = await client.get("/v1/deals", params=params, headers=me)
        return [d["name"] for d in found.json()]

    assert await names() == ["Oak flip", "Maple duplex"]
    assert await names(strategy="flip") == ["Oak flip"]
    assert await names(q="maple") == ["Maple duplex"]
    assert await names(sort="name") == ["Maple duplex", "Oak flip"]


async def test_updating_inputs_reruns_the_analysis(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    created = (await client.post("/v1/deals", json=deal_body(), headers=me)).json()
    patched = await client.patch(
        f"/v1/deals/{created['id']}",
        json={"inputs": {**RENTAL, "price": 200_000}, "notes": "seller is motivated"},
        headers=me,
    )
    body = patched.json()
    assert body["notes"] == "seller is motivated"
    assert body["analysis"]["metrics"]["cap_rate"] > created["analysis"]["metrics"]["cap_rate"]


async def test_monthly_ledger_on_request(client: httpx.AsyncClient, me: dict[str, str]) -> None:
    created = (await client.post("/v1/deals", json=deal_body(), headers=me)).json()
    detail = (
        await client.get(f"/v1/deals/{created['id']}", params={"monthly": "true"}, headers=me)
    ).json()
    assert len(detail["analysis"]["months"]) == 121


async def test_delete(client: httpx.AsyncClient, me: dict[str, str]) -> None:
    created = (await client.post("/v1/deals", json=deal_body(), headers=me)).json()
    assert (await client.delete(f"/v1/deals/{created['id']}", headers=me)).status_code == 204
    assert (await client.get(f"/v1/deals/{created['id']}", headers=me)).status_code == 404


async def test_moving_cards_keeps_each_column_in_order(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    ids = [
        (await client.post("/v1/deals", json=deal_body(f"d{i}"), headers=me)).json()["id"]
        for i in range(3)
    ]

    async def column(stage: str) -> list[str]:
        found = (await client.get("/v1/deals", params={"stage": stage}, headers=me)).json()
        return [d["name"] for d in sorted(found, key=lambda d: d["position"])]

    assert await column("lead") == ["d0", "d1", "d2"]
    await client.put(f"/v1/deals/{ids[2]}/stage", json={"stage": "lead", "position": 0}, headers=me)
    assert await column("lead") == ["d2", "d0", "d1"]
    moved = await client.put(
        f"/v1/deals/{ids[0]}/stage", json={"stage": "offer", "position": 9}, headers=me
    )
    assert moved.json()["position"] == 0
    assert await column("lead") == ["d2", "d1"]
    assert await column("offer") == ["d0"]


async def test_moving_to_owned_records_the_purchase_date(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    created = (await client.post("/v1/deals", json=deal_body(), headers=me)).json()
    moved = await client.put(
        f"/v1/deals/{created['id']}/stage", json={"stage": "owned", "position": 0}, headers=me
    )
    assert moved.json()["acquired_on"] == date.today().isoformat()


async def test_share_links_are_public_until_turned_off(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    created = (await client.post("/v1/deals", json=deal_body(), headers=me)).json()
    token = (await client.post(f"/v1/deals/{created['id']}/share", headers=me)).json()["token"]
    again = (await client.post(f"/v1/deals/{created['id']}/share", headers=me)).json()["token"]
    assert token == again
    assert len(token) == 43

    shared = await client.get(f"/v1/shared/{token}")
    assert shared.status_code == 200
    assert shared.headers["x-robots-tag"] == "noindex"
    assert shared.json()["analysis"]["metrics"]["irr"] == created["analysis"]["metrics"]["irr"]
    assert "owner_id" not in shared.text
    assert created["id"] not in shared.text

    await client.delete(f"/v1/deals/{created['id']}/share", headers=me)
    assert (await client.get(f"/v1/shared/{token}")).status_code == 404


async def test_compare_returns_each_deal(client: httpx.AsyncClient, me: dict[str, str]) -> None:
    a = (await client.post("/v1/deals", json=deal_body("a"), headers=me)).json()["id"]
    b = (await client.post("/v1/deals", json=deal_body("b", price=300_000), headers=me)).json()[
        "id"
    ]
    found = await client.get("/v1/compare", params=[("ids", a), ("ids", b)], headers=me)
    assert [d["name"] for d in found.json()] == ["a", "b"]
    too_few = await client.get("/v1/compare", params=[("ids", a)], headers=me)
    assert too_few.status_code == 422


async def test_wholesale_deals_summarize_the_fee(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    body = {
        "name": "Assign it",
        "inputs": {
            "strategy": "wholesale",
            "contract_price": 120_000,
            "after_repair_value": 240_000,
            "rehab_cost": 40_000,
            "property_tax_annual": 2_400,
            "insurance_annual": 1_800,
        },
    }
    created = (await client.post("/v1/deals", json=body, headers=me)).json()
    assert created["analysis"]["strategy"] == "wholesale"
    assert created["summary"]["total_profit"] == created["analysis"]["assignment_fee"]


async def test_notes_can_be_cleared_but_a_name_cannot(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    deal = (await client.post("/v1/deals", json=deal_body(), headers=me)).json()
    url = f"/v1/deals/{deal['id']}"
    await client.patch(url, json={"notes": "call the listing agent"}, headers=me)
    cleared = await client.patch(url, json={"notes": None}, headers=me)
    assert cleared.status_code == 200
    assert cleared.json()["notes"] == ""
    assert (await client.patch(url, json={"name": None}, headers=me)).status_code == 422
    assert (await client.get(url, headers=me)).json()["name"] == "Duplex"


async def test_work_that_outlasts_the_hold_is_a_field_error(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    brrrr = {
        "strategy": "brrrr",
        "price": 150_000,
        "rehab_cost": 40_000,
        "rehab_months": 4,
        "after_repair_value": 240_000,
        "seasoning_months": 12,
        "hold_years": 1,
        "operations": RENTAL["operations"],
    }
    body = {"name": "Rehab", "inputs": brrrr}
    response = await client.post("/v1/deals", json=body, headers=me)
    assert response.status_code == 422
    assert "seasoning_months" in response.text
    rental = deal_body(rehab_months=12, hold_years=1)
    assert (await client.post("/v1/deals", json=rental, headers=me)).status_code == 422


async def test_deals_saved_before_the_stricter_checks_still_load(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    creative = {
        "strategy": "creative",
        "price": 200_000,
        "operations": RENTAL["operations"],
        "existing_balance": 180_000,
        "existing_rate": 0.04,
        "existing_months_left": 300,
        "cash_to_seller": 10_000,
    }
    sub_to = (
        await client.post("/v1/deals", json={"name": "Sub to", "inputs": creative}, headers=me)
    ).json()
    short = (
        await client.post(
            "/v1/deals", json=deal_body("Short hold", hold_years=2, exit_cap_rate=0.06), headers=me
        )
    ).json()
    # What older code let through: more cash to the seller than the price leaves, and a cap rate
    # exit on a hold with no full year of rent.
    overpaid = (
        "update deals set inputs = jsonb_set(inputs, '{cash_to_seller}', '40000') where id = :id"
    )
    too_short = (
        """update deals set inputs = inputs || '{"hold_years": 1, "rehab_months": 1}' """
        "where id = :id"
    )
    async with db.as_system() as session:
        await session.execute(text(overpaid), {"id": uuid.UUID(sub_to["id"])})
        await session.execute(text(too_short), {"id": uuid.UUID(short["id"])})
        for statement in migration("20261012_repair_inputs_saved_before_stricter_checks").REPAIRS:
            await session.execute(text(statement))

    listed = await client.get("/v1/deals", headers=me)
    assert listed.status_code == 200
    inputs = {d["name"]: d["inputs"] for d in listed.json()}
    assert inputs["Sub to"]["cash_to_seller"] == 20_000
    assert inputs["Short hold"]["exit_cap_rate"] is None
    assert inputs["Short hold"]["hold_years"] == 1
