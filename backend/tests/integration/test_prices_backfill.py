"""`python -m kaptan.prices.backfill`: argument validation, dry run, a write run, failures (offline)."""

from __future__ import annotations

import argparse
from collections.abc import Iterator
from typing import Any

import httpx
import pytest

from kaptan.db import connect
from kaptan.prices import backfill
from kaptan.prices.http import SourceError, make_http_client
from kaptan.settings import Settings, get_settings
from tests.fixtures.prices.cassette import CassetteTransport

FROTO_ARGS = ["--tickers", "froto", "--from", "2025-04-01", "--to", "2025-06-30", "--min-interval", "0.5"]


@pytest.fixture
def offline(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    def client(**_: Any) -> httpx.AsyncClient:
        return make_http_client(transport=CassetteTransport())

    async def no_sleep(_: float) -> None:
        return None

    monkeypatch.setattr(backfill, "make_http_client", client)
    monkeypatch.setattr("kaptan.prices.http.asyncio.sleep", no_sleep)
    yield


def test_parse_args_validates_input() -> None:
    args = backfill.parse_args(["--tickers", "thyao, FROTO THYAO", "--from", "2025-01-01", "--to", "2025-02-01"])
    assert args.tickers == ["THYAO", "FROTO"] and args.sources == ["isyatirim", "yfinance"]
    assert backfill.parse_args([*FROTO_ARGS, "--sources", "yfinance"]).sources == ["yfinance"]
    bad = [
        ["--tickers", "TH;", "--from", "2025-01-01", "--to", "2025-02-01"],
        ["--tickers", "THYAO", "--from", "2025-02-01", "--to", "2025-01-01"],
        ["--tickers", "THYAO", "--from", "2010-01-01", "--to", "2025-01-01"],
        ["--tickers", "THYAO", "--from", "2025-01-01", "--to", "2025-02-01", "--min-interval", "0.1"],
        ["--tickers", "THYAO", "--from", "2025-01-01", "--to", "2025-02-01", "--sources", "borsapy"],
    ]
    for argv in bad:
        with pytest.raises(SystemExit):
            backfill.parse_args(argv)
    with pytest.raises(argparse.ArgumentTypeError):
        backfill._sources("nope")


async def test_dry_run_prints_a_summary(offline: None, capsys: pytest.CaptureFixture[str]) -> None:
    assert await backfill.main(backfill.parse_args([*FROTO_ARGS, "--dry-run"])) == 0
    out = capsys.readouterr().out
    assert "FROTO " in out and "2025-05-07 bedelsiz x0.1" in out and "2 HTTP requests" in out


async def test_source_failure_exits_1(
    offline: None, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    async def broken(*_: Any, **__: Any) -> None:
        raise SourceError("isyatirim: giving up after 4 attempts (HTTP 503)")

    monkeypatch.setattr(backfill, "fetch_ticker", broken)
    assert await backfill.main(backfill.parse_args([*FROTO_ARGS, "--dry-run"])) == 1
    assert "FROTO  FAILED" in capsys.readouterr().err


async def test_cassette_refuses_unrecorded_requests(offline: None) -> None:
    args = backfill.parse_args(["--tickers", "AKBNK", "--from", "2025-04-01", "--to", "2025-06-30", "--dry-run"])
    with pytest.raises(AssertionError, match="unrecorded request"):
        await backfill.main(args)


async def test_write_run_into_the_test_database(
    offline: None, migrated: Settings, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(
        backfill, "get_settings", lambda: migrated.model_copy(update={"test_database_url": migrated.database_url})
    )
    assert await backfill.main(backfill.parse_args([*FROTO_ARGS, "--test"])) == 0
    assert "FROTO  raw=  60 (open 59)" in capsys.readouterr().out
    owner = migrated.database_owner_url
    assert owner is not None
    conn = await connect(owner.get_secret_value())
    try:
        row = await (
            await conn.execute("SELECT count(*) AS n FROM core.corporate_actions WHERE ticker = 'FROTO'")
        ).fetchone()
        assert row is not None and row["n"] == 2
        await conn.execute("TRUNCATE core.prices_daily, core.corporate_actions")
        await conn.commit()
    finally:
        await conn.close()


async def test_missing_test_database_url(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setattr(backfill, "get_settings", lambda: get_settings().model_copy(update={"test_database_url": None}))
    assert await backfill.main(backfill.parse_args([*FROTO_ARGS, "--test"])) == 2
