.PHONY: db dev lint pytest test fmt check image web types

db:
	docker compose up -d --wait db

dev: db
	cd api && ENVIRONMENT=$${ENVIRONMENT:-development} uv run alembic upgrade head
	cd api && ENVIRONMENT=$${ENVIRONMENT:-development} uv run uvicorn parcel.app:create_app --factory --reload

lint:
	cd api && uv run ruff check . && uv run ruff format --check . && uv run mypy src tests

# Expects Postgres on port 5433. `make test` starts it; CI provides its own.
pytest:
	cd api && uv run pytest tests -p no:logging --cov --cov-report=term

test: db pytest

fmt:
	cd api && uv run ruff check --fix . && uv run ruff format .

check: lint test

image:
	docker build -t parcel-api api

web:
	cd web && pnpm dev

# Regenerate the web client's types from the API's OpenAPI schema.
types:
	cd api && ENVIRONMENT=test uv run python -m parcel.openapi > ../web/node_modules/.tmp/openapi.json
	cd web && pnpm exec openapi-typescript node_modules/.tmp/openapi.json --default-non-nullable=false -o src/lib/api/schema.d.ts
