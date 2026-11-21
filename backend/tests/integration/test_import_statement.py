"""Statement import: what is new, what is already in the book, what conflicts; only ticked rows are written, as
normal audited ledger rows; the same file twice adds nothing; the upload endpoint refuses what it must."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import httpx
import pytest

from kaptan.api.errors import ApiError
from kaptan.db import DictConn
from kaptan.domain.schemas.imports import ImportApplyRequest, ImportMapping, ImportPreview, ImportRequest, ImportResult
from kaptan.domain.schemas.money import MoneyInput
from kaptan.imports import service
from kaptan.portfolio import money
from kaptan.risk.book import own_book
from tests.contract.harness import assert_matches
from tests.integration.a_support import api, call, fresh, token
from tests.integration.order_support import DECIDE_AT, RISK_OFFICER, desk, empty_book, one, start_money

pytestmark = pytest.mark.integration
__all__ = ["api", "desk", "fresh"]

NOW = DECIDE_AT  # Monday 2027-01-11 14:00 Istanbul
HEADER = ["Tarih", "İşlem", "Hisse", "Adet", "Fiyat", "Komisyon", "Tutar"]
MAPPING = ImportMapping(
    has_header=True, date=0, type=1, ticker=2, qty=3, price=4, commission=5, amount=6, types={"ozel": "skip"}
)
FILE = [
    HEADER,
    ["08.01.2027", "Para Yatırma", "", "", "", "", "50.000,00"],
    ["08.01.2027", "Alış", "KRGCL", "1000", "30,00", "60,00", ""],
    ["09.01.2027", "Satış", "KRGCL", "400", "31,00", "24,80", ""],
    ["09.01.2027", "Temettü", "KRGCL", "", "", "", "85,00"],
    ["09.01.2027", "Para Çekme", "", "", "", "", "1.000,00"],
]


def _req(rows: list[list[str]], mapping: ImportMapping = MAPPING) -> ImportRequest:
    return ImportRequest(source="Midas ekstresi", mapping=mapping, rows=rows)


def _apply(rows: list[list[str]], selected: list[int], mapping: ImportMapping = MAPPING) -> ImportApplyRequest:
    return ImportApplyRequest(source="Midas ekstresi", mapping=mapping, rows=rows, selected=selected)


async def _book(conn: DictConn, amount: int = 100_000) -> None:
    await empty_book(conn)
    await start_money(conn, amount, NOW - timedelta(days=4))  # Thursday 2027-01-07


def _by_status(p: ImportPreview) -> list[str]:
    return [r.status for r in p.rows]


async def test_the_preview_judges_each_row_and_writes_nothing(desk: DictConn) -> None:
    await _book(desk)
    before = await own_book(desk, NOW)
    out = await service.preview(desk, _req(FILE), now=NOW)
    assert _by_status(out) == ["new"] * 5
    assert (out.new, out.recorded, out.conflict) == (5, 0, 0)
    assert await own_book(desk, NOW) == before
    assert_matches("ImportPreview", out.model_dump(mode="json"))


async def test_apply_writes_normal_audited_rows_and_the_book_adds_up(desk: DictConn) -> None:
    await _book(desk)
    res = await service.apply(desk, _apply(FILE, [1, 2, 3, 4, 5]), RISK_OFFICER, now=NOW)
    assert res.written == 5 and res.failed == []
    book = await own_book(desk, NOW)
    buy_cost = Decimal(1000 * 30) + Decimal("60.00")
    sell_in = Decimal(400 * 31) - Decimal("24.80")
    assert book.cash == Decimal(100_000) + 50_000 - buy_cost + sell_in + Decimal("85.00") - 1_000
    held = await one(desk, "SELECT qty, origin FROM trading.positions WHERE ticker = 'KRGCL' AND book = 'personal'")
    assert held == {"qty": 600, "origin": "own"}
    deposit = await one(desk, "SELECT occurred_at FROM trading.book_ledger WHERE kind = 'deposit'")
    assert deposit is not None and deposit["occurred_at"].astimezone().date().isoformat() in (
        "2027-01-08",
        "2027-01-07",
    )
    audits = await one(
        desk,
        "SELECT count(*) AS n FROM audit.audit_log WHERE action IN ('money.deposited', 'money.withdrawn',"
        " 'holding.bought', 'holding.sold', 'dividend.recorded', 'import.applied')",
    )
    assert audits is not None and audits["n"] == 6
    assert_matches("ImportResult", res.model_dump(mode="json"))


async def test_the_same_file_twice_adds_nothing(desk: DictConn) -> None:
    await _book(desk)
    await service.apply(desk, _apply(FILE, [1, 2, 3, 4, 5]), RISK_OFFICER, now=NOW)
    cash = (await own_book(desk, NOW)).cash
    again = await service.apply(desk, _apply(FILE, [1, 2, 3, 4, 5]), RISK_OFFICER, now=NOW)
    assert again.written == 0
    assert _by_status(again.preview) == ["recorded"] * 5
    assert (await own_book(desk, NOW)).cash == cash
    n = await one(desk, "SELECT count(*) AS n FROM trading.import_rows")
    assert n == {"n": 5}


async def test_two_identical_rows_in_one_file_are_two_rows_but_not_twice_on_reimport(desk: DictConn) -> None:
    await _book(desk)
    rows = [HEADER, *[["08.01.2027", "Para Yatırma", "", "", "", "", "100,00"]] * 2]
    first = await service.apply(desk, _apply(rows, [1, 2]), RISK_OFFICER, now=NOW)
    assert first.written == 2
    second = await service.apply(desk, _apply(rows, [1, 2]), RISK_OFFICER, now=NOW)
    assert second.written == 0


async def test_only_ticked_rows_are_written(desk: DictConn) -> None:
    await _book(desk)
    res = await service.apply(desk, _apply(FILE, [1]), RISK_OFFICER, now=NOW)
    assert res.written == 1
    assert _by_status(res.preview)[0] == "recorded" and res.preview.new == 4


async def test_conflicts_are_named_and_not_written(desk: DictConn) -> None:
    await _book(desk, 10_000)
    rows = [
        HEADER,
        ["08.01.2027", "Alış", "KRGCL", "1000", "30,00", "", ""],  # 30 000 > 10 000 cash
        ["08.01.2027", "Satış", "KRGCL", "5", "30,00", "", ""],  # nothing held
        ["08.01.2027", "Temettü", "KRGCL", "", "", "", "10,00"],  # never held
        ["08.01.2027", "Alış", "ZZZZZ", "1", "1,00", "", ""],  # unknown share
        ["05.01.2027", "Para Yatırma", "", "", "", "", "10,00"],  # before the book started
        ["20.01.2027", "Para Yatırma", "", "", "", "", "10,00"],  # in the future
        ["08.01.2027", "Para Çekme", "", "", "", "", "99.999,00"],
    ]
    out = await service.preview(desk, _req(rows), now=NOW)
    assert _by_status(out) == ["conflict"] * 7
    res = await service.apply(desk, _apply(rows, list(range(1, 8))), RISK_OFFICER, now=NOW)
    assert res.written == 0


async def test_before_the_starting_money_everything_waits(desk: DictConn) -> None:
    await empty_book(desk)
    out = await service.preview(desk, _req(FILE), now=NOW)
    assert out.started is False and out.conflict == 5


async def test_a_deposit_funds_a_later_purchase_in_the_same_file(desk: DictConn) -> None:
    await _book(desk, 1_000)
    out = await service.preview(desk, _req(FILE[:3]), now=NOW)
    assert _by_status(out) == ["new", "new"]


async def test_unknown_words_and_unreadable_cells_are_asked_not_guessed(desk: DictConn) -> None:
    await _book(desk)
    rows = [
        HEADER,
        ["08.01.2027", "Virman", "", "", "", "", "10,00"],
        ["08.01.2027", "Özel", "", "", "", "", "10,00"],
        ["sekiz ocak", "Alış", "KRGCL", "1", "30,00", "", ""],
        ["08.01.2027", "Alış", "KRGCL", "1.5", "30,00", "", ""],
        ["08.01.2027", "Alış", "KRGCL", "1", "1.234", "", ""],
        ["08.01.2027", "Alış", "=cmd", "1", "30,00", "", ""],
    ]
    out = await service.preview(desk, _req(rows), now=NOW)
    assert _by_status(out) == ["invalid", "skipped", "invalid", "invalid", "invalid", "invalid"]
    assert out.unknown_types == ["virman"]


async def test_something_the_book_already_has_is_recorded_not_new(desk: DictConn) -> None:
    await _book(desk)
    await money.add_money(
        desk, MoneyInput(kind="deposit", amount_try=50_000), RISK_OFFICER, now=NOW - timedelta(days=3)
    )
    out = await service.preview(desk, _req(FILE[:2]), now=NOW)
    assert out.rows[0].status == "recorded" and "aynısı" in out.rows[0].reason


async def test_the_mapping_is_remembered_per_source(desk: DictConn) -> None:
    await _book(desk)
    await service.apply(desk, _apply(FILE, [1]), RISK_OFFICER, now=NOW)
    saved = await service.saved_mapping(desk, "Midas ekstresi")
    assert saved is not None and saved[0].ticker == 2
    assert "Midas ekstresi" in await service.sources(desk)
    assert await service.saved_mapping(desk, "Başka") is None


async def test_a_sale_of_more_than_held_at_write_time_is_reported_not_raised(desk: DictConn) -> None:
    await _book(desk)
    rows = [
        HEADER,
        ["08.01.2027", "Alış", "KRGCL", "10", "30,00", "1,00", ""],
        ["09.01.2027", "Satış", "KRGCL", "10", "31,00", "1,00", ""],
    ]
    res = await service.apply(desk, _apply(rows, [1, 2]), RISK_OFFICER, now=NOW)
    assert res.written == 2
    held = await one(desk, "SELECT count(*) AS n FROM trading.positions WHERE ticker = 'KRGCL' AND book = 'personal'")
    assert held == {"n": 0}


def test_the_apply_body_refuses_a_bad_source_name() -> None:
    for bad in ("=cmd|' /C calc'!A0", "../../etc", "", "x" * 41, "-x"):
        with pytest.raises(ValueError):
            ImportRequest(source=bad, mapping=MAPPING, rows=[HEADER])


def test_api_error_is_a_plain_exception() -> None:
    assert issubclass(ApiError, Exception)


async def _upload(http: httpx.AsyncClient, data: bytes, name: str, source: str = "Yükleme denemesi") -> httpx.Response:
    from kaptan.api.main import API_PREFIX
    from tests.conftest import bearer

    return await http.post(
        f"{API_PREFIX}/me/import/read", params={"source": source, "filename": name}, content=data,
        headers=bearer(await token(http)),
    )  # fmt: skip


async def test_the_upload_endpoint_reads_a_csv_and_matches_the_contract(api: httpx.AsyncClient) -> None:
    csv_bytes = "Tarih;İşlem;Hisse\n12.03.2027;Alış;KRGCL\n".encode()
    res = await _upload(api, csv_bytes, "ekstre.csv")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["file_kind"] == "csv" and body["has_header_guess"] is True and body["saved_mapping"] is None
    assert_matches("ImportTable", body)


async def test_the_upload_endpoint_refuses_big_binary_and_wrong_names(api: httpx.AsyncClient) -> None:
    big = await _upload(api, b"a;b\n" * 1_500_000, "x.csv")
    assert big.status_code == 413 and big.json()["code"] == "too_large"
    exe = await _upload(api, b"MZ\x90\x00" + b"\x00" * 64, "x.csv")
    assert exe.status_code == 415
    renamed = await _upload(api, b"a;b\n1;2\n", "x.xlsx")
    assert renamed.status_code == 415
    bad_source = await _upload(api, b"a;b\n1;2\n", "x.csv", source="=cmd")
    assert bad_source.status_code == 422


async def test_the_upload_endpoint_needs_a_signed_in_person(api: httpx.AsyncClient) -> None:
    from kaptan.api.main import API_PREFIX

    res = await api.post(f"{API_PREFIX}/me/import/read", params={"source": "x", "filename": "x.csv"}, content=b"a\n1\n")
    assert res.status_code == 401


async def test_the_preview_and_apply_endpoints_answer_in_the_contract_shape(api: httpx.AsyncClient) -> None:
    body = {"source": "API denemesi", "mapping": MAPPING.model_dump(mode="json"), "number_style": "auto", "rows": FILE}
    res = await call(api, "POST", "/me/import/preview", body)
    assert res.status_code == 200, res.text
    assert_matches("ImportPreview", res.json())
    done = await call(api, "POST", "/me/import/apply", {**body, "selected": []})
    assert done.status_code == 200 and done.json()["written"] == 0
    assert_matches("ImportResult", done.json())
    assert "API denemesi" in (await call(api, "GET", "/me/import/sources")).json()["sources"]


def test_result_model_is_importable() -> None:
    assert ImportResult.model_fields.keys() >= {"written", "failed", "preview"}
