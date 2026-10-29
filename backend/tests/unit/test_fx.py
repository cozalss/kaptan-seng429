"""TCMB client, parser and backfill CLI offline (respx); currency normalisation (FR-41)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal as D  # noqa: N817
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from kaptan.market import fx_backfill
from kaptan.market.fx import (
    TODAY_URL,
    FxSourceError,
    archive_url,
    fetch_day,
    fetch_today,
    make_client,
    parse_bulletin,
)
from kaptan.market.fx_store import currency_code, upsert_rates
from kaptan.prices.calendar import IST

BULLETIN = (Path(__file__).resolve().parents[1] / "fixtures" / "fx" / "tcmb_20261020.xml").read_bytes()
DAY = date(2026, 10, 20)


async def no_sleep(_: float) -> None:
    return None


def test_parse_bulletin_reads_forex_buying_per_unit() -> None:
    rates = {r.currency: r for r in parse_bulletin(BULLETIN)}
    assert set(rates) == {"USD", "EUR", "JPY", "XDR"}  # IRR has no ForexBuying: skipped
    assert rates["USD"].rate == D("41.8123") and rates["EUR"].rate == D("48.6510")
    assert rates["JPY"].rate == D("0.275310")  # quoted per 100 yen
    assert rates["USD"].d == DAY and rates["USD"].available_at == datetime(2026, 10, 20, 16, 30, tzinfo=IST)
    assert archive_url(DAY) == "https://www.tcmb.gov.tr/kurlar/202610/20102026.xml"


def test_parse_bulletin_rejects_junk() -> None:
    with pytest.raises(FxSourceError, match="not a TCMB bulletin"):
        parse_bulletin(b"<html>maintenance")
    with pytest.raises(FxSourceError, match="without rates"):
        parse_bulletin(b'<Tarih_Date Tarih="20.10.2026"><Currency Kod="USD"></Currency></Tarih_Date>')
    with pytest.raises(FxSourceError, match="no date"):
        parse_bulletin(b"<Tarih_Date></Tarih_Date>")
    with pytest.raises(FxSourceError, match="too large"):
        parse_bulletin(b" " * (600 * 1024))
    tarih_only = parse_bulletin(
        b'<Tarih_Date Tarih="19.10.2026"><Currency CurrencyCode="USD"><Unit>1</Unit>'
        b"<ForexBuying>41.70</ForexBuying></Currency></Tarih_Date>"
    )
    assert tarih_only[0].d == date(2026, 10, 19)


@respx.mock
async def test_fetch_day_today_and_retries() -> None:
    url = archive_url(DAY)
    route = respx.get(url).mock(side_effect=[httpx.Response(503), httpx.Response(200, content=BULLETIN)])
    respx.get(archive_url(date(2026, 10, 29))).mock(return_value=httpx.Response(404))  # Cumhuriyet Bayramı
    respx.get(archive_url(date(2026, 10, 21))).mock(return_value=httpx.Response(403))
    respx.get(archive_url(date(2026, 10, 22))).mock(side_effect=httpx.ConnectTimeout("slow"))
    respx.get(TODAY_URL).mock(return_value=httpx.Response(200, content=BULLETIN))
    async with make_client() as http:
        rates = await fetch_day(http, DAY, sleep=no_sleep)
        assert rates is not None and route.call_count == 2 and len(rates) == 4
        assert await fetch_day(http, date(2026, 10, 29), sleep=no_sleep) is None
        with pytest.raises(FxSourceError, match="HTTP 403"):
            await fetch_day(http, date(2026, 10, 21), sleep=no_sleep)
        with pytest.raises(FxSourceError, match="ConnectTimeout"):
            await fetch_day(http, date(2026, 10, 22), sleep=no_sleep)
        assert (await fetch_today(http, sleep=no_sleep))[0].d == DAY


@respx.mock
async def test_fetch_today_missing_is_an_error() -> None:
    respx.get(TODAY_URL).mock(return_value=httpx.Response(404))
    async with make_client() as http:
        with pytest.raises(FxSourceError, match=r"today.xml missing"):
            await fetch_today(http, sleep=no_sleep)


@pytest.mark.parametrize(
    ("raw", "code"),
    [
        ("TL", "TRY"),
        ("try", "TRY"),
        ("Türk Lirası", "TRY"),
        ("ABD Doları", "USD"),
        ("$", "USD"),
        ("usd", "USD"),
        ("Avro", "EUR"),
        ("Euro", "EUR"),
        ("€", "EUR"),
        ("İngiliz Sterlini", "GBP"),
        ("CHF", "CHF"),
        ("SEK", "SEK"),
        ("ABD Doları cinsinden", "USD"),
        ("", None),
        (None, None),
        ("bilinmiyor", None),
    ],
)
def test_currency_code(raw: str | None, code: str | None) -> None:
    assert currency_code(raw) == code


class _Cur:
    def __init__(self) -> None:
        self.rows: list[Any] = []

    async def __aenter__(self) -> _Cur:
        return self

    async def __aexit__(self, *_: Any) -> None:
        return None

    async def executemany(self, _sql: str, rows: list[Any]) -> None:
        self.rows.extend(rows)


class _Conn:
    def __init__(self) -> None:
        self.cur = _Cur()

    def cursor(self) -> _Cur:
        return self.cur


async def test_upsert_skips_try_and_empty() -> None:
    conn = _Conn()
    rates = parse_bulletin(BULLETIN)
    assert await upsert_rates(conn, rates) == 4  # type: ignore[arg-type]
    assert await upsert_rates(conn, []) == 0  # type: ignore[arg-type]
    assert {r[1] for r in conn.cur.rows} == {"USD", "EUR", "JPY", "XDR"}


@respx.mock
async def test_backfill_walks_weekdays_and_records_failures() -> None:
    assert fx_backfill.weekdays(date(2026, 10, 16), date(2026, 10, 20)) == [
        date(2026, 10, 16),
        date(2026, 10, 19),
        date(2026, 10, 20),
    ]
    respx.get(archive_url(date(2026, 10, 16))).mock(return_value=httpx.Response(404))
    respx.get(archive_url(date(2026, 10, 19))).mock(return_value=httpx.Response(400))
    respx.get(archive_url(DAY)).mock(return_value=httpx.Response(200, content=BULLETIN))
    async with make_client() as http:
        days = fx_backfill.weekdays(date(2026, 10, 16), DAY)
        report = await fx_backfill.backfill(http, None, days, sleep=no_sleep)
    assert (report.days, report.bulletins, report.rows, report.failed) == (3, 1, 4, [date(2026, 10, 19)])


def _transport(status: int, body: bytes = b"") -> httpx.MockTransport:
    return httpx.MockTransport(lambda _req: httpx.Response(status, content=body))


async def test_cli_dry_run_and_today(capsys: pytest.CaptureFixture[str]) -> None:
    args = fx_backfill.parse_args(["--from", "2026-10-20", "--to", "2026-10-20", "--dry-run"])
    assert await fx_backfill.main(args, _transport(200, BULLETIN)) == 0
    assert "1 bulletins, 4 rows, failed: none" in capsys.readouterr().out
    today = fx_backfill.parse_args(["--today", "--dry-run"])
    assert await fx_backfill.main(today, _transport(200, BULLETIN)) == 0
    assert "EUR=48.651, USD=41.8123" in capsys.readouterr().out
    assert await fx_backfill.main(today, _transport(404)) == 1
    bad = fx_backfill.parse_args(["--from", "2026-10-21", "--to", "2026-10-21", "--dry-run"])
    assert await fx_backfill.main(bad, _transport(400)) == 1


@pytest.mark.parametrize(
    "argv",
    [
        [],
        ["--from", "2026-10-20"],
        ["--from", "2026-10-20", "--to", "2026-10-01"],
        ["--from", "2010-01-01", "--to", "2026-10-01"],
        ["--today", "--min-interval", "0.1"],
    ],
)
def test_cli_rejects_bad_arguments(argv: list[str]) -> None:
    with pytest.raises(SystemExit):
        fx_backfill.parse_args(argv)
