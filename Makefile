.PHONY: db dev lint pytest test fmt check image

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
