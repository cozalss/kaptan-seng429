"""The daily `fx_rates` job stores the TCMB bulletin (recorded response, no live call)."""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator
from datetime import date, datetime
from pathlib import Path

import httpx
import pytest

from kaptan.db import DictConn
from kaptan.market.fx import make_client
from kaptan.prices.calendar import IST
from kaptan.settings import Settings
from kaptan.workers import scheduler as s

pytestmark = pytest.mark.integration

BULLETIN = (Path(__file__).resolve().parents[1] / "fixtures" / "fx" / "tcmb_20261020.xml").read_bytes()
NOW = datetime(2026, 10, 20, 17, 0, tzinfo=IST)


def ctx_with(settings: Settings, status: int, body: bytes) -> s.Ctx:
    @contextlib.asynccontextmanager
    async def http() -> AsyncIterator[httpx.AsyncClient]:
        async with make_client(httpx.MockTransport(lambda _r: httpx.Response(status, content=body))) as client:
            yield client

    return s.Ctx(settings=settings, pool=None, redis=None, http=http)


def test_the_job_is_scheduled_after_the_tcmb_publication_window() -> None:
    job = s.BY_NAME["fx_rates"]
    assert job.at is not None and job.at.hour * 60 + job.at.minute >= 16 * 60 + 30


async def test_the_bulletin_lands_in_fx_rates(pg: DictConn, migrated: Settings) -> None:
    summary = await s.job_fx_rates(pg, ctx_with(migrated, 200, BULLETIN), date(2026, 10, 20), NOW)
    assert summary["rates"] > 0
    async with pg.cursor() as cur:
        await cur.execute(
            "SELECT count(*) AS n FROM core.fx_rates WHERE currency = 'USD' AND d = %s", (date(2026, 10, 20),)
        )
        row = await cur.fetchone()
    assert row is not None and row["n"] == 1


async def test_a_missing_bulletin_is_reported_not_raised(pg: DictConn, migrated: Settings) -> None:
    summary = await s.job_fx_rates(pg, ctx_with(migrated, 404, b""), date(2026, 10, 20), NOW)
    assert summary["rates"] == 0 and "error" in summary
