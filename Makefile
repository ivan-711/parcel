.PHONY: db dev test lint fmt check image

db:
	docker compose up -d --wait db

dev: db
	cd api && uv run alembic upgrade head
	cd api && uv run uvicorn parcel.app:create_app --factory --reload

test: db
	cd api && uv run pytest tests -p no:logging --cov

lint:
	cd api && uv run ruff check . && uv run ruff format --check . && uv run mypy src tests

fmt:
	cd api && uv run ruff check --fix . && uv run ruff format .

check: lint test

image:
	docker build -t parcel-api api
