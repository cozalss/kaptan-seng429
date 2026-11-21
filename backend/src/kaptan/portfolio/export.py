"""The "Kayıtlarımı indir" file: the person's money movements and recorded fills as one CSV that opens correctly in
a Turkish Excel: UTF-8 with a BOM, `;` between cells, a decimal comma, dates as gg.aa.yyyy ss:dd (Istanbul), CRLF lines.

Every ledger row of every book is there, corrections and undo rows included (nothing is hidden: a corrected row says
"Düzeltildi" and the correction row says which record it corrects). Text cells are safe to open: a cell that starts
with = + - @ (or a tab) gets a leading apostrophe so a spreadsheet never runs it as a formula, quotes are doubled,
line breaks become spaces, and the text is NFC-normalised so ç ğ ı ö ş ü and İ stay single characters.
"""

from __future__ import annotations

import unicodedata
from collections.abc import Iterator
from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.prices.calendar import IST

BOM: Final = "﻿"
SEP: Final = ";"
EOL: Final = "\r\n"
FORMULA_STARTS: Final = ("=", "+", "-", "@", "\t", "\r")

HEADER: Final = (
    "Defter", "Kayıt no", "Tarih", "Tür", "Hisse", "Adet", "Fiyat (₺)", "Tutar (₺)", "Komisyon (₺)",
    "Komisyon tahmin mi", "Nakit etkisi (₺)", "Durum", "Düzelttiği kayıt no", "Not",
)  # fmt: skip
KINDS: Final = {
    "start": "Başlangıç parası",
    "deposit": "Para ekledim",
    "withdrawal": "Para çektim",
    "holding": "Elimdeki hisse",
    "buy": "Aldım",
    "sell": "Sattım",
    "correction": "Düzeltme",
    "reversal": "Geri alma",
}
ROWS_SQL: Final = """
SELECT l.book_no, l.id, l.kind, l.occurred_at, l.ticker, l.qty_delta, l.new_qty, l.price, l.amount_try,
       l.commission_try, l.commission_estimated, l.cash_delta, l.corrects_id, l.note,
       EXISTS (SELECT 1 FROM trading.book_ledger c WHERE c.corrects_id = l.id AND c.kind = 'reversal') AS undone,
       EXISTS (SELECT 1 FROM trading.book_ledger c WHERE c.corrects_id = l.id AND c.kind = 'correction') AS corrected
  FROM trading.book_ledger l ORDER BY l.book_no, l.occurred_at, l.id
"""


def number(value: Decimal | float | int | None, places: int | None = 2) -> str:
    """A number with a decimal comma and no thousands separator ("1250,50"); empty for None."""
    if value is None:
        return ""
    d = Decimal(str(value))
    text = f"{d:.{places}f}" if places is not None else format(d.normalize(), "f")
    return text.replace(".", ",")


def text(value: str | None) -> str:
    """A text cell: NFC, one line, formula-safe, quoted when it has `;` or a quote."""
    clean = " ".join(unicodedata.normalize("NFC", value or "").split())
    if clean.startswith(FORMULA_STARTS):
        clean = "'" + clean
    if any(ch in clean for ch in (SEP, '"')):
        return '"' + clean.replace('"', '""') + '"'
    return clean


def when(moment: datetime) -> str:
    return moment.astimezone(IST).strftime("%d.%m.%Y %H:%M")


def status_of(row: dict[str, Any]) -> str:
    if row["kind"] in ("correction", "reversal"):
        return "Düzeltme kaydı" if row["kind"] == "correction" else "Geri alma kaydı"
    return "Geri alındı" if row["undone"] else "Düzeltildi" if row["corrected"] else "Geçerli"


def line(row: dict[str, Any]) -> str:
    """One ledger row as one CSV line (without the line break)."""
    qty = row["new_qty"] if row["new_qty"] is not None else abs(int(row["qty_delta"])) or None
    cells = [
        str(row["book_no"]), str(row["id"]), when(row["occurred_at"]), text(KINDS.get(row["kind"], row["kind"])),
        text(row["ticker"]), "" if qty is None else str(qty), number(row["price"], None), number(row["amount_try"]),
        number(row["commission_try"]) if row["kind"] in ("buy", "sell", "correction") and row["ticker"] else "",
        ("Evet" if row["commission_estimated"] else "Hayır") if row["kind"] in ("buy", "sell") else "",
        number(row["cash_delta"]), text(status_of(row)), "" if row["corrects_id"] is None else str(row["corrects_id"]),
        text(row["note"]),
    ]  # fmt: skip
    return SEP.join(cells)


async def records(conn: AsyncConnection[Any]) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(ROWS_SQL)
        return [dict(r) for r in await cur.fetchall()]


def csv_lines(rows: list[dict[str, Any]]) -> Iterator[str]:
    """The file in pieces: the BOM and the header first, then one piece per row."""
    yield BOM + SEP.join(HEADER) + EOL
    for row in rows:
        yield line(row) + EOL
