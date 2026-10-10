FROM public.ecr.aws/docker/library/python:3.13-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY alembic.ini ./
COPY src ./src
RUN uv sync --locked --no-dev --no-editable

FROM public.ecr.aws/docker/library/python:3.13-slim
RUN useradd --create-home --uid 1000 app
WORKDIR /app
# Owned by root so the server process can read its code but not change it.
COPY --from=build /app /app
# Only trust forwarded headers from Railway's edge, which strips any the client sent.
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 FORWARDED_ALLOW_IPS=100.0.0.0/8
USER app
EXPOSE 8000
# Migrations run here rather than as a pre-deploy step, which Railway skipped on
# CLI uploads. A failed upgrade stops the container before it can serve.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn parcel.app:create_app --factory --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-2} --proxy-headers --no-access-log"]
