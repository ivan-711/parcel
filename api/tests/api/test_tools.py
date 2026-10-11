import httpx
import pytest

from .conftest import RENTAL, Login


@pytest.fixture
def me(login: Login) -> dict[str, str]:
    return login("analyst")


async def test_analyze_without_saving(client: httpx.AsyncClient, me: dict[str, str]) -> None:
    response = await client.post("/v1/analyze", json={"inputs": RENTAL}, headers=me)
    assert response.status_code == 200
    assert response.json()["metrics"]["noi"] == 15_636.0


async def test_solve_finds_the_price_for_a_target(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    body = {"inputs": RENTAL, "field": "price", "metric": "cash_on_cash", "target": 0.06}
    result = (await client.post("/v1/analyze/solve", json=body, headers=me)).json()
    assert result["value"] == pytest.approx(189_052.23, abs=0.01)
    assert result["analysis"]["metrics"]["cash_on_cash"] == pytest.approx(0.06, abs=1e-5)


async def test_solve_reaches_a_target_irr(client: httpx.AsyncClient, me: dict[str, str]) -> None:
    inputs = {
        **RENTAL,
        "operations": {
            "monthly_rent": 2_000,
            "property_tax_annual": 3_000,
            "insurance_annual": 1_000,
        },
    }
    body = {"inputs": inputs, "field": "price", "metric": "irr", "target": 0.12}
    result = (await client.post("/v1/analyze/solve", json=body, headers=me)).json()
    assert result["value"] == pytest.approx(223_382.83, abs=0.01)
    assert result["analysis"]["metrics"]["irr"] == pytest.approx(0.12, abs=1e-5)


async def test_solve_reports_an_unreachable_target(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    body = {"inputs": RENTAL, "field": "interest_rate", "metric": "dscr", "target": 50}
    assert (await client.post("/v1/analyze/solve", json=body, headers=me)).json() == {
        "value": None,
        "analysis": None,
    }


async def test_solve_refuses_inputs_the_strategy_lacks(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    flip = {
        "strategy": "flip",
        "price": 100_000,
        "rehab_cost": 20_000,
        "after_repair_value": 160_000,
        "property_tax_annual": 1_000,
        "insurance_annual": 800,
    }
    body = {"inputs": flip, "field": "operations.monthly_rent", "metric": "roi", "target": 0.2}
    response = await client.post("/v1/analyze/solve", json=body, headers=me)
    assert response.status_code == 422
    assert response.json()["code"] == "field_not_in_strategy"


async def test_solve_needs_the_input_set_first(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    body = {"inputs": RENTAL, "field": "after_repair_value", "metric": "irr", "target": 0.1}
    response = await client.post("/v1/analyze/solve", json=body, headers=me)
    assert response.json()["code"] == "field_not_set"


async def test_sensitivity_returns_a_tornado_and_a_grid(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    result = (
        await client.post("/v1/analyze/sensitivity", json={"inputs": RENTAL}, headers=me)
    ).json()
    assert result["swings"][0]["field"] == "appreciation"
    grid = result["grid"]
    assert grid["row_field"] == "price"
    assert grid["col_field"] == "operations.monthly_rent"
    assert len(grid["values"]) == 7
    assert all(len(row) == 7 for row in grid["values"])
    assert grid["values"][3][3] == pytest.approx(result["base"])


async def test_flip_sensitivity_grid_uses_resale_value(
    client: httpx.AsyncClient, me: dict[str, str]
) -> None:
    flip = {
        "strategy": "flip",
        "price": 100_000,
        "rehab_cost": 20_000,
        "after_repair_value": 160_000,
        "property_tax_annual": 1_000,
        "insurance_annual": 800,
    }
    body = {"inputs": flip, "metric": "total_profit"}
    result = (await client.post("/v1/analyze/sensitivity", json=body, headers=me)).json()
    assert result["grid"]["col_field"] == "after_repair_value"


async def test_simulation_is_a_pro_feature(client: httpx.AsyncClient, me: dict[str, str]) -> None:
    response = await client.post("/v1/analyze/simulate", json={"inputs": RENTAL}, headers=me)
    assert response.status_code == 402


async def test_simulation_runs_in_the_demo(client: httpx.AsyncClient) -> None:
    token = (await client.post("/v1/demo")).json()["token"]
    body = {"inputs": RENTAL, "runs": 2_000, "seed": 4}
    response = await client.post(
        "/v1/analyze/simulate", json=body, headers={"authorization": f"Bearer {token}"}
    )
    result = response.json()
    assert result["runs"] == 2_000
    assert 0 <= result["probability_of_loss"] <= 1
    assert 1_900 < sum(result["irr_histogram"]["counts"]) <= 2_000
    assert len(result["irr_histogram"]["edges"]) == 31
