"""A backend on the fixture day for the panel's Playwright suite (`npm run e2e:api`). Tests only.

    uv run python -m tests.harness.serve --port 8000      # DATABASE_URL + DATABASE_OWNER_URL of a throwaway database

Migrates and seeds that database, serves the production app with the fixed clock and adds two routes no running
system has: `POST /api/v1/demo/reset` (seed again, clock back to 13:40) and `POST /api/v1/demo/tamper`. The passphrase
is the suite's own (E2E_PASSPHRASE, default kaptan2026).
"""

from __future__ import annotations

import argparse
import os
from typing import Any

import uvicorn
from fastapi import APIRouter, FastAPI, Request, Response
from pydantic import BaseModel, SecretStr

from kaptan.api.deps import CurrentUser, settings_dep
from kaptan.api.loop import run
from kaptan.api.main import API_PREFIX
from kaptan.auth.passphrase import hash_passphrase
from kaptan.db import connect
from kaptan.ops.migrate import upgrade
from kaptan.settings import Settings, get_settings
from tests.harness.app import create_test_app
from tests.harness.fixtures import DemoFixtures
from tests.harness.seed import reseed
from tests.harness.tamper import set_tamper


class TamperBody(BaseModel):
    on: bool


def harness_settings() -> Settings:
    base = get_settings()
    passphrase = os.environ.get("E2E_PASSPHRASE", "kaptan2026")
    return base.model_copy(
        update={
            "llm_mode": "replay",
            "kap_live": False,
            "prices_live": False,
            "passphrase_hash": SecretStr(hash_passphrase(passphrase)),
        }
    )


def _owner_url(settings: Settings) -> str:
    if settings.database_owner_url is None:
        raise SystemExit("DATABASE_OWNER_URL is not set")
    return settings.database_owner_url.get_secret_value()


async def seed_once(settings: Settings) -> Any:
    owner = await connect(_owner_url(settings))
    try:
        return await reseed(owner)
    finally:
        await owner.close()


def harness_routes(settings: Settings) -> APIRouter:
    router = APIRouter(tags=["harness"])

    @router.post("/demo/reset", status_code=204)
    async def reset(request: Request, actor: CurrentUser) -> Response:
        result = await seed_once(settings)
        request.app.state.clock.restart(result.started_at)
        return Response(status_code=204)

    @router.post("/demo/tamper")
    async def tamper(body: TamperBody, actor: CurrentUser) -> dict[str, bool]:
        owner = await connect(_owner_url(settings))
        try:
            return {"tamper_on": await set_tamper(owner, body.on, int(DemoFixtures().meta["audit_tamper_pos"]))}
        finally:
            await owner.close()

    return router


def build_app(settings: Settings) -> FastAPI:
    app = create_test_app(settings)
    app.dependency_overrides[settings_dep] = lambda: settings
    app.include_router(harness_routes(settings), prefix=API_PREFIX)
    return app


def main() -> None:
    parser = argparse.ArgumentParser(prog="tests.harness.serve")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    settings = harness_settings()
    upgrade(settings)
    run(seed_once(settings))
    run(uvicorn.Server(uvicorn.Config(build_app(settings), host=args.host, port=args.port)).serve())


if __name__ == "__main__":
    main()
