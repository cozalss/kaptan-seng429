"""KAP notices about an action on a share the person holds (GET /me/corporate/notices).

Nothing is copied: the notices are read from `core.disclosures` (and the full text, when it was fetched) each
time, through `kaptan.ingest.corporate_actions.detect`. A notice stays until the person records the action or
dismisses it, or until it is older than `WINDOW`. Nothing here changes the book.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.api.deps import Actor
from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append
from kaptan.domain.schemas._base import iso_ms
from kaptan.ingest.corporate_actions import Detected, detect
from kaptan.portfolio import ledger

WINDOW: Final = timedelta(days=45)
KAP_URL: Final = "https://www.kap.org.tr/tr/Bildirim/{}"
MONTHS: Final = (
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
)  # fmt: skip
UNKNOWN_NOTICE: Final = "Bu bildirimi tanımıyorum."
NOT_READ: Final = "Rakamları bildirimden güvenle okuyamadım; hesabına geçen gerçek rakamı sen yaz."

NOTICES_SQL: Final = """
SELECT d.disclosure_index, d.primary_ticker, d.stock_codes, d.subject, d.summary, d.published_at,
       (SELECT t.body FROM core.disclosure_texts t
         WHERE t.disclosure_index = d.disclosure_index AND t.lang = 'tr') AS body
  FROM core.disclosures d
 WHERE d.origin = 'kap' AND d.reason <> 'CANC' AND d.published_at > %(since)s AND d.published_at <= %(now)s
   AND (d.primary_ticker = ANY(%(held)s) OR d.stock_codes && %(held)s)
   AND NOT EXISTS (SELECT 1 FROM trading.corporate_notices n WHERE n.disclosure_index = d.disclosure_index)
 ORDER BY d.published_at DESC, d.disclosure_index DESC
"""
RECORDED_SQL: Final = """
SELECT c.ticker, c.kind, c.recorded_at FROM trading.corporate_book c
 WHERE c.corrects_id IS NULL AND c.book_no = (SELECT max(no) FROM trading.book_epochs) AND NOT EXISTS (
         SELECT 1 FROM trading.corporate_book u WHERE u.corrects_id = c.id)
"""
EXISTS_SQL: Final = "SELECT 1 AS x FROM core.disclosures WHERE disclosure_index = %s AND origin = 'kap'"
DISMISS_SQL: Final = """
INSERT INTO trading.corporate_notices (disclosure_index, status, decided_at) VALUES (%s, 'dismissed', %s)
ON CONFLICT (disclosure_index) DO UPDATE SET status = 'dismissed', decided_at = EXCLUDED.decided_at
"""


def _day(d: date) -> str:
    return f"{d.day} {MONTHS[d.month - 1]}"


def _lira(x: float) -> str:
    text = f"{x:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"{text[:-3]}" if text.endswith(",00") else text


def headline(ticker: str, found: Detected) -> str:
    """One calm sentence; only facts that were read appear in it."""
    if found.kind == "dividend":
        parts = []
        if found.per_share_gross is not None:
            parts.append(f"hisse başı {_lira(found.per_share_gross)} ₺ brüt")
        if found.pay_date is not None:
            parts.append(f"ödeme {_day(found.pay_date)}")
        detail = f": {', '.join(parts)}" if parts else ""
        return f"{ticker} kâr payı dağıtacağını açıkladı{detail}. Hesabına geçince buraya yaz."
    if found.kind == "bonus":
        pct = "" if found.bonus_pct is None else f": her 100 paya {_lira(found.bonus_pct)} yeni pay"
        return f"{ticker} bedelsiz pay dağıtacağını açıkladı{pct}. Paylar hesabına geçince yeni adedini buraya yaz."
    if found.kind == "rights":
        return f"{ticker} bedelli sermaye artırımı duyurdu. Katılırsan aldığın payları buraya yaz."
    return f"{ticker} payını bölüyor. Yeni adedin hesabına geçince buraya yaz."


def _held_ticker(row: dict[str, Any], held: dict[str, int]) -> str | None:
    codes = [row["primary_ticker"], *row["stock_codes"]]
    return next((c for c in codes if c in held), None)


def _view(row: dict[str, Any], ticker: str, found: Detected, qty: int) -> dict[str, Any]:
    gross = found.per_share_gross
    sure = (found.kind == "dividend" and gross is not None) or (found.kind == "bonus" and found.bonus_pct is not None)
    return {
        "id": f"bildirim-{row['disclosure_index']}",
        "ticker": ticker,
        "kind": found.kind,
        "headline": headline(ticker, found),
        "published_at": iso_ms(row["published_at"]),
        "held_qty": qty,
        "per_share_gross_try": gross,
        "per_share_net_try": found.per_share_net,
        "pay_date": found.pay_date,
        "ex_date": found.ex_date,
        "bonus_pct": found.bonus_pct,
        "expected_gross_try": None if gross is None else round(gross * qty, 2),
        "facts_note": "" if sure else NOT_READ,
        "url": KAP_URL.format(row["disclosure_index"]),
    }


async def _rows(conn: AsyncConnection[Any], sql: str, params: Any = ()) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return [dict(r) for r in await cur.fetchall()]


async def notices(conn: AsyncConnection[Any], now: datetime) -> list[dict[str, Any]]:
    """The open notices for the shares held now, newest first."""
    held = {s.ticker: s.qty for s in await ledger.shares(conn, now)}
    if not held:
        return []
    params = {"since": now - WINDOW, "now": now, "held": sorted(held)}
    recorded = await _rows(conn, RECORDED_SQL)
    out = []
    for row in await _rows(conn, NOTICES_SQL, params):
        ticker = _held_ticker(row, held)
        found = detect(row["subject"], row["summary"], row["body"] or "") if ticker else None
        if ticker is None or found is None:
            continue
        done = any(
            r["ticker"] == ticker and r["kind"] == _record_kind(found.kind) and r["recorded_at"] >= row["published_at"]
            for r in recorded
        )
        if not done:
            out.append(_view(row, ticker, found, held[ticker]))
    return out


def _record_kind(kind: str) -> str:
    return "bonus" if kind == "split" else kind


async def dismiss(conn: AsyncConnection[Any], notice_id: str, actor: Actor, *, now: datetime) -> None:
    """POST /me/corporate/notices/{id}/dismiss: the person does not want this prompt. 404 not_found."""
    head, _, tail = notice_id.partition("-")
    if head != "bildirim" or not tail.isdigit() or not await _rows(conn, EXISTS_SQL, (int(tail),)):
        raise ApiError(404, "not_found", UNKNOWN_NOTICE)
    async with conn.transaction():
        await conn.execute(DISMISS_SQL, (int(tail), now))
        draft = AuditDraft(actor.audit_actor, "corporate.dismissed", "book", notice_id, {}, occurred_at=now)
        await append(conn, [draft], now=now)
