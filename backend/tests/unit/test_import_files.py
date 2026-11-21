"""Reading an uploaded statement: type from the bytes, size, macros, zip bombs, formulas. Offline."""

from __future__ import annotations

import io
import zipfile
from collections.abc import AsyncIterator
from decimal import Decimal

import pytest
from openpyxl import Workbook

from kaptan.api.errors import ApiError
from kaptan.imports import files
from kaptan.imports.normalize import parse_date, parse_number, type_key


def _xlsx(rows: list[list[object]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    for r in rows:
        ws.append(r)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def _code(data: bytes, name: str) -> str:
    with pytest.raises(ApiError) as err:
        files.parse(data, name)
    return err.value.code


async def _stream(*chunks: bytes) -> AsyncIterator[bytes]:
    for c in chunks:
        yield c


def test_a_semicolon_csv_in_windows_1254_is_read() -> None:
    data = "Tarih;İşlem;Hisse\n12.03.2027;Alış;KRGCL\n".encode("cp1254")
    kind, rows, truncated = files.parse(data, "ekstre.csv")
    assert (kind, truncated) == ("csv", False)
    assert rows[1] == ["12.03.2027", "Alış", "KRGCL"]


def test_a_formula_in_a_csv_cell_stays_text() -> None:
    _, rows, _ = files.parse(b'a,b\n"=HYPERLINK(""http://x"")",2\n', "x.csv")
    assert rows[1][0].startswith("=HYPERLINK")  # never evaluated, only text


def test_an_xlsx_gives_plain_numbers_and_dates() -> None:
    from datetime import date

    kind, rows, _ = files.parse(_xlsx([["Tarih", "Tutar"], [date(2027, 3, 12), 1234.5]]), "x.xlsx")
    assert kind == "xlsx" and rows[1] == ["2027-03-12", "1234.5"]


def test_an_xlsx_formula_is_not_calculated() -> None:
    _, rows, _ = files.parse(_xlsx([["a", "b"], ["=1+1", "x"]]), "x.xlsx")
    assert rows[1][0] in ("", "=1+1")  # no cached value: never calculated, never 2


def test_the_name_must_agree_with_the_bytes() -> None:
    assert _code(_xlsx([["a"]]), "x.csv") == "unsupported_type"
    assert _code(b"a;b\n1;2\n", "x.xlsx") == "unsupported_type"
    assert _code(b"%PDF-1.4 nothing", "x.csv") == "unsupported_type"
    assert _code(b"a;b\n1;2\n", "x.exe") == "unsupported_type"


def test_binary_and_old_excel_and_images_are_refused() -> None:
    assert _code(b"\xd0\xcf\x11\xe0" + b"\x00" * 50, "x.xls") == "old_excel"
    assert _code(b"\x89PNG\r\n\x1a\n" + b"\x00" * 50, "x.csv") == "unsupported_type"
    assert _code(b"a;b\x00\x01\x02", "x.csv") == "unsupported_type"


def test_a_workbook_with_macros_is_refused() -> None:
    buf = io.BytesIO(_xlsx([["a"]]))
    with zipfile.ZipFile(buf, "a") as z:
        z.writestr("xl/vbaProject.bin", b"x")
    assert _code(buf.getvalue(), "x.xlsx") == "macros"


def test_a_zip_that_unpacks_huge_is_refused() -> None:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("xl/workbook.xml", "<a/>")
        z.writestr("xl/big.xml", b"0" * (files.MAX_UNZIPPED + 1))
    assert len(buf.getvalue()) < files.MAX_BYTES
    assert _code(buf.getvalue(), "x.xlsx") == "unsupported_type"


def test_a_zip_that_is_not_a_workbook_is_refused() -> None:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("hello.txt", "hi")
    assert _code(buf.getvalue(), "x.xlsx") == "unsupported_type"


def test_a_pdf_without_text_or_broken_is_refused_in_plain_words() -> None:
    assert _code(b"%PDF-1.4\ngarbage", "x.pdf") in ("unreadable", "scanned")


def test_the_size_limit_stops_the_stream_and_the_header() -> None:
    import asyncio

    big = b"x" * (files.MAX_BYTES + 1)

    async def run(declared: int | None, *chunks: bytes) -> bytes:
        return await files.read_limited(_stream(*chunks), declared)

    with pytest.raises(ApiError) as err:
        asyncio.run(run(files.MAX_BYTES + 1, b"x"))
    assert err.value.status == 413
    with pytest.raises(ApiError) as err2:
        asyncio.run(run(None, big[:3_000_000], big[3_000_000:]))
    assert err2.value.status == 413
    assert asyncio.run(run(3, b"abc")) == b"abc"


def test_rows_and_cells_are_capped_and_cleaned() -> None:
    text = "a;b\n" + "".join(f"{i};{'x' * 500}\x07\n" for i in range(files.MAX_ROWS + 20))
    _, rows, truncated = files.parse(text.encode(), "x.csv")
    assert truncated and len(rows) == files.MAX_ROWS + 1
    assert len(rows[1][1]) == 100 and "\x07" not in rows[1][1]


@pytest.mark.parametrize(
    ("text", "style", "expected"),
    [
        ("1.234,56", "auto", "1234.56"),
        ("1,234.56", "auto", "1234.56"),
        ("12,5", "auto", "12.5"),
        ("12.5", "auto", "12.5"),
        ("1.234.567", "auto", "1234567"),
        ("1.234", "auto", None),  # one thousand two hundred or 1,234: never guessed
        ("1.234", "dot", "1.234"),
        ("₺ 1.250,00 TL", "auto", "1250.00"),
        ("(100,00)", "auto", "-100.00"),
        ("abc", "auto", None),
        ("", "auto", None),
        ("1,2,3.4.5", "auto", None),
    ],
)
def test_numbers_are_read_or_refused(text: str, style: str, expected: str | None) -> None:
    got = parse_number(text, style)
    assert got == (None if expected is None else Decimal(expected))


def test_dates_are_day_first_and_strict() -> None:
    assert parse_date("12.03.2027") is not None and parse_date("12.03.2027")[0].month == 3  # type: ignore[index]
    assert parse_date("2027-03-12 14:05") is not None
    assert parse_date("31.02.2027") is None
    assert parse_date("12.03.27") is None
    assert parse_date("yarın") is None


def test_type_words_fold_turkish_letters() -> None:
    assert type_key("ALIŞ") == type_key("Alış") == type_key("alis") == "alis"
    assert type_key("Para Çekme!") == "para cekme"
    assert type_key("TEMETTÜ") == "temettu"
