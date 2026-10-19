# syntax=docker/dockerfile:1.7
# KAPtan backend image: the API, ingest_worker, agent_worker, scheduler and the migrate/bootstrap jobs.
# The command picks the process (docker-entrypoint.sh):
#   docker build -t kaptan-backend backend/
#   docker run --rm --env-file prod.env kaptan-backend api            # or ingest_worker | agent_worker |
#                                                                     #    scheduler | migrate | bootstrap | dlq
# No secret is baked in: every value comes from the environment at run time (.env is in .dockerignore).

ARG PYTHON_IMAGE=python:3.11.9-slim-bookworm

FROM ghcr.io/astral-sh/uv:0.12.5 AS uv

# ── build: resolve the locked dependencies into /app/.venv ─────────────────────
FROM ${PYTHON_IMAGE} AS build
COPY --from=uv /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PYTHON=/usr/local/bin/python3.11 \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev

# ── runtime: the venv + the code, as an unprivileged user ──────────────────────
FROM ${PYTHON_IMAGE} AS runtime
LABEL org.opencontainers.image.title="kaptan-backend" \
      org.opencontainers.image.source="https://github.com/cozalss/kaptan-seng429"
RUN groupadd --system --gid 10001 kaptan \
 && useradd --system --uid 10001 --gid kaptan --home-dir /app --no-create-home --shell /usr/sbin/nologin kaptan
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
# settings.BACKEND_DIR = /app: config/, migrations/, alembic.ini and the demo fixtures (replay LLM) live here.
COPY src ./src
COPY config ./config
COPY data ./data
COPY migrations ./migrations
COPY alembic.ini pyproject.toml ./
COPY tests/__init__.py ./tests/__init__.py
COPY tests/fixtures/demo ./tests/fixtures/demo
COPY --chmod=0755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUTF8=1 \
    KAPTAN_HOST=0.0.0.0 \
    KAPTAN_PORT=8000 \
    KAPTAN_ENV=prod
USER kaptan:kaptan
EXPOSE 8000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-m", "kaptan.ops.healthcheck"]
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["api"]
