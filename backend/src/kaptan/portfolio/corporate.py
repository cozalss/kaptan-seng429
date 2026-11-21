"""Company actions on the person's shares: a dividend received, a bonus issue (bedelsiz)
or split, a rights issue (bedelli).

    dividend   cash +net, no shares, no outside flow: it is income, so equity and "since the start" rise by it
    bonus      shares +added, the total cost stays (the average cost falls), no cash, no gain
    rights     shares +qty at the subscription price, cash -(qty x price), no gain

Each record takes the book lock, writes one ledger row (kinds `dividend` / `bonus` / `rights`, never a flow), one
row of `trading.corporate_book` and one audit record in the caller's transaction. Records are append-only: an undo
is a new row that names the one it corrects and reverses its ledger effect at the same moment in the book's
time, so nothing in between is left wrong; the stored closes from that day on are then written again from the
corrected book (`run_pnl_eod` is idempotent). A bonus takes effect at the first price of its ex-date
(`open_known_at`), so the book never values new shares at the old, pre-split price.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.api.deps import Actor
from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append
from kaptan.domain.schemas._base import iso_ms
from kaptan.domain.schemas.corporate import BonusInput, DividendInput, RightsInput
from kaptan.portfolio import ledger
from kaptan.portfolio.ledger import cents
from kaptan.portfolio.pnl import LIVE_STRATEGY
from kaptan.prices.calendar import IST, is_trading_day, istanbul_date, next_session, open_known_at
from kaptan.risk.book import own_book
from kaptan.risk.pnl_eod import run_pnl_eod

NOT_STARTED: Final = "Önce başlangıç paranı gir."
NOT_HELD: Final = "Bu hisse şu an elinde görünmüyor."
NEVER_HELD: Final = "Bu hisse defterinde hiç yok."
FUTURE_DAY: Final = "Gelecekteki bir tarihi giremezsin."
NOT_MORE: Final = "Yeni adet, şimdiki adetten büyük olmalı."
OVER_CASH: Final = "Elindeki nakitten fazlasını ödeyemezsin."
NOT_FOUND: Final = "Kayıt bulunamadı."
ALREADY_UNDONE: Final = "Bu kaydı zaten geri aldın."
IS_UNDO: Final = "Bu bir düzeltme kaydı; geri alınmaz."
CHANGED: Final = "Bu kayıttan sonra bu hisseyi aldığın ya da sattığın için geri alamıyorum. Önce son hareketi düzelt."
UNKNOWN_NOTICE: Final = "Bu bildirimi tanımıyorum."

RECORDS_SQL: Final = """
SELECT c.id, c.kind, c.ticker, coalesce(i.name, c.ticker) AS company, c.effective_at, c.recorded_at, c.net_try,
       c.gross_try, c.qty_added, c.qty_before, c.price, c.note, c.corrects_id,
       EXISTS (SELECT 1 FROM trading.corporate_book u WHERE u.corrects_id = c.id) AS undone
  FROM trading.corporate_book c LEFT JOIN core.issuers i ON i.ticker = c.ticker
 WHERE c.book_no = (SELECT max(no) FROM trading.book_epochs)
 ORDER BY c.id DESC
"""
POSITIONS_SQL: Final = """
SELECT id, qty, avg_cost FROM trading.positions WHERE ticker = %s AND book = 'personal'
 ORDER BY opened_at, id FOR UPDATE
"""
EVER_SQL: Final = """
SELECT EXISTS (SELECT 1 FROM trading.book_ledger
                WHERE ticker = %s AND book_no = (SELECT max(no) FROM trading.book_epochs)) AS ever
"""
NAME_SQL: Final = "SELECT name FROM core.issuers WHERE ticker = %s"
ONE_RECORD_SQL: Final = "SELECT * FROM trading.corporate_book WHERE id = %s FOR UPDATE"
UNDONE_SQL: Final = "SELECT EXISTS (SELECT 1 FROM trading.corporate_book WHERE corrects_id = %s) AS undone"
INSERT_RECORD_SQL: Final = """
INSERT INTO trading.corporate_book (kind, ticker, effective_at, recorded_at, net_try, gross_try, qty_before,
  qty_added, price, detail, ledger_id, corrects_id, notice_index, note, book_no)
VALUES (%(kind)s, %(ticker)s, %(effective_at)s, %(recorded_at)s, %(net_try)s, %(gross_try)s, %(qty_before)s,
  %(qty_added)s, %(price)s, %(detail)s, %(ledger_id)s, %(corrects_id)s, %(notice_index)s, %(note)s,
  (SELECT max(no) FROM trading.book_epochs))
RETURNING id
"""
NOTICE_SQL: Final = """
INSERT INTO trading.corporate_notices (disclosure_index, status, decided_at) VALUES (%s, %s, %s)
ON CONFLICT (disclosure_index) DO UPDATE SET status = EXCLUDED.status, decided_at = EXCLUDED.decided_at
"""
CLOSES_SQL: Final = "SELECT d FROM trading.pnl_daily WHERE strategy = %s AND d >= %s ORDER BY d"
TOTALS_SQL: Final = """
SELECT c.ticker, coalesce(i.name, c.ticker) AS company,
       coalesce(sum(c.net_try)
         FILTER (WHERE (c.effective_at AT TIME ZONE 'Europe/Istanbul')::date >= %s), 0) AS year_try,
       coalesce(sum(c.net_try), 0) AS total_try
  FROM trading.corporate_book c LEFT JOIN core.issuers i ON i.ticker = c.ticker
 WHERE c.kind = 'dividend' AND c.corrects_id IS NULL AND c.book_no = (SELECT max(no) FROM trading.book_epochs)
   AND NOT EXISTS (SELECT 1 FROM trading.corporate_book u WHERE u.corrects_id = c.id)
 GROUP BY c.ticker, i.name ORDER BY total_try DESC, c.ticker
"""


@dataclass(frozen=True, slots=True)
class Outcome:
    body: dict[str, Any]


async def _rows(conn: AsyncConnection[Any], sql: str, params: Any = ()) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return [dict(r) for r in await cur.fetchall()]


def _audit(actor: Actor, action: str, record_id: int, payload: dict[str, Any], now: datetime) -> AuditDraft:
    return AuditDraft(actor.audit_actor, action, "book", f"kurum-{record_id}", payload, occurred_at=now)


def _record_id(value: str) -> int:
    head, _, tail = value.partition("-")
    if head != "kurum" or not tail.isdigit():
        raise ApiError(404, "not_found", NOT_FOUND)
    return int(tail)


def _notice_index(value: str | None) -> int | None:
    if value is None:
        return None
    head, _, tail = value.partition("-")
    if head != "bildirim" or not tail.isdigit():
        raise ApiError(422, "unknown_notice", UNKNOWN_NOTICE)
    return int(tail)


def _noon(day: date, now: datetime) -> datetime:
    """The day the money moved, at noon Istanbul, but never later than now."""
    return min(datetime.combine(day, time(12, 0), IST), now)


def _first_price_of(day: date) -> datetime:
    """The moment a bonus takes effect: the first price of its ex-date (the next session when it is not one)."""
    return open_known_at(day if is_trading_day(day) else next_session(day))


def _check_day(day: date, now: datetime) -> None:
    if day > istanbul_date(now):
        raise ApiError(422, "future_date", FUTURE_DAY)


async def _company(conn: AsyncConnection[Any], ticker: str) -> str:
    rows = await _rows(conn, NAME_SQL, (ticker,))
    return str(rows[0]["name"]) if rows else ticker


async def _positions(conn: AsyncConnection[Any], ticker: str) -> list[dict[str, Any]]:
    rows = await _rows(conn, POSITIONS_SQL, (ticker,))
    if not rows:
        raise ApiError(409, "not_held", NOT_HELD)
    return rows


async def _require_started(conn: AsyncConnection[Any], now: datetime) -> Any:
    book = await own_book(conn, now)
    if not book.started:
        raise ApiError(409, "not_started", NOT_STARTED)
    return book


async def _insert_record(conn: AsyncConnection[Any], **fields: Any) -> int:
    row: dict[str, Any] = {
        "net_try": None, "gross_try": None, "qty_before": None, "qty_added": None, "price": None,
        "detail": Jsonb({}), "corrects_id": None, "notice_index": None, "note": "", **fields,
    }  # fmt: skip
    return int((await _rows(conn, INSERT_RECORD_SQL, row))[0]["id"])


async def _close_notice(conn: AsyncConnection[Any], notice: int | None, now: datetime) -> None:
    if notice is not None:
        await conn.execute(NOTICE_SQL, (notice, "recorded", now))


async def refresh_closes(conn: AsyncConnection[Any], since: datetime) -> None:
    """Write the stored closes again from the day a record took effect, oldest first, from the corrected book."""
    for row in await _rows(conn, CLOSES_SQL, (LIVE_STRATEGY, istanbul_date(since))):
        await run_pnl_eod(conn, row["d"])


async def corporate_book(conn: AsyncConnection[Any], now: datetime) -> dict[str, Any]:
    """CorporateBook: dividends this year and in all (per share and together) and every record, newest first."""
    year_start = date(istanbul_date(now).year, 1, 1)
    per = [
        {
            "ticker": r["ticker"], "company": r["company"], "this_year_try": float(r["year_try"]),
            "total_try": float(r["total_try"]),
        }
        for r in await _rows(conn, TOTALS_SQL, (year_start,))
    ]  # fmt: skip
    records = [_record_view(r) for r in await _rows(conn, RECORDS_SQL)]
    return {
        "this_year_try": round(sum(p["this_year_try"] for p in per), 2),
        "total_try": round(sum(p["total_try"] for p in per), 2),
        "per_holding": per,
        "records": records,
    }


def _record_view(r: dict[str, Any]) -> dict[str, Any]:
    added = None if r["qty_added"] is None else int(r["qty_added"])
    before = None if r["qty_before"] is None else int(r["qty_before"])
    return {
        "id": f"kurum-{r['id']}",
        "kind": r["kind"],
        "ticker": r["ticker"],
        "company": r["company"],
        "occurred_at": iso_ms(r["effective_at"]),
        "recorded_at": iso_ms(r["recorded_at"]),
        "net_try": None if r["net_try"] is None else float(r["net_try"]),
        "gross_try": None if r["gross_try"] is None else float(r["gross_try"]),
        "qty_added": added,
        "qty_after": None if added is None or before is None else before + added,
        "price": None if r["price"] is None else float(r["price"]),
        "note": r["note"],
        "corrects": None if r["corrects_id"] is None else f"kurum-{r['corrects_id']}",
        "undone": bool(r["undone"]),
    }


async def record_dividend(
    conn: AsyncConnection[Any], body: DividendInput, actor: Actor, *, now: datetime
) -> dict[str, Any]:
    """POST /me/corporate/dividends. 409 not_started, 422 future_date / never_held."""
    _check_day(body.received_on, now)
    net = cents(body.net_try)
    gross = None if body.gross_try is None else cents(body.gross_try)
    notice = _notice_index(body.notice_id)
    async with conn.transaction():
        await ledger.lock(conn)
        await _require_started(conn, now)
        if not (await _rows(conn, EVER_SQL, (body.ticker,)))[0]["ever"]:
            raise ApiError(422, "never_held", NEVER_HELD)
        at = _noon(body.received_on, now)
        ledger_id = await ledger._insert(
            conn, kind="dividend", occurred_at=at, recorded_at=now, amount_try=net, cash_delta=net,
            ticker=body.ticker, note=body.note.strip(),
        )  # fmt: skip
        rid = await _insert_record(
            conn, kind="dividend", ticker=body.ticker, effective_at=at, recorded_at=now, net_try=net, gross_try=gross,
            ledger_id=ledger_id, notice_index=notice, note=body.note.strip(),
        )  # fmt: skip
        company = await _company(conn, body.ticker)
        payload = {
            "ticker": body.ticker,
            "company": company,
            "net_try": float(net),
            "received_on": body.received_on.isoformat(),
        }
        await append(conn, [_audit(actor, "dividend.recorded", rid, payload, now)], now=now)
        await _close_notice(conn, notice, now)
        await refresh_closes(conn, at)
        return await corporate_book(conn, now)


def _split_new_total(body: BonusInput, total: int) -> int:
    """The new total share count: typed, or the old one grown by the percentage (a part of a share is paid in cash)."""
    if body.new_qty is not None:
        new_total = body.new_qty
    else:
        assert body.bonus_pct is not None
        new_total = int(Decimal(total) * (1 + Decimal(str(body.bonus_pct)) / 100))
    if new_total <= total:
        raise ApiError(422, "not_more", NOT_MORE)
    return new_total


def _grow(positions: list[dict[str, Any]], new_total: int) -> list[dict[str, Any]]:
    """Each position's new quantity (its share of the new total, the leftover to the oldest) and the average cost
    that keeps its total cost."""
    total = sum(int(p["qty"]) for p in positions)
    quantities = [int(p["qty"]) * new_total // total for p in positions]
    quantities[0] += new_total - sum(quantities)
    out = []
    for p, new_q in zip(positions, quantities, strict=True):
        old_q, avg = int(p["qty"]), Decimal(p["avg_cost"])
        out.append(
            {
                "id": int(p["id"]), "qty_before": old_q, "avg_before": float(avg), "qty_after": new_q,
                "avg_after": float(avg * old_q / new_q),
            }
        )  # fmt: skip
    return out


async def _apply_positions(conn: AsyncConnection[Any], changes: list[dict[str, Any]], *, undo: bool) -> None:
    for c in changes:
        qty, avg = (c["qty_before"], c["avg_before"]) if undo else (c["qty_after"], c["avg_after"])
        await conn.execute("UPDATE trading.positions SET qty = %s, avg_cost = %s WHERE id = %s", (qty, avg, c["id"]))


async def record_bonus(conn: AsyncConnection[Any], body: BonusInput, actor: Actor, *, now: datetime) -> dict[str, Any]:
    """POST /me/corporate/bonus. 409 not_started / not_held, 422 not_more / future_date."""
    _check_day(body.ex_date, now)
    notice = _notice_index(body.notice_id)
    async with conn.transaction():
        await ledger.lock(conn)
        await _require_started(conn, now)
        positions = await _positions(conn, body.ticker)
        total = sum(int(p["qty"]) for p in positions)
        new_total = _split_new_total(body, total)
        changes = _grow(positions, new_total)
        cost = cents(sum(Decimal(p["avg_cost"]) * int(p["qty"]) for p in positions))
        at = _first_price_of(body.ex_date)
        added = new_total - total
        ledger_id = await ledger._insert(
            conn, kind="bonus", occurred_at=at, recorded_at=now, amount_try=cost, cash_delta=Decimal(0),
            ticker=body.ticker, qty_delta=added, price=cents(cost / new_total) or Decimal("0.01"),
            position_id=changes[0]["id"], note=body.note.strip(),
        )  # fmt: skip
        await _apply_positions(conn, changes, undo=False)
        rid = await _insert_record(
            conn, kind="bonus", ticker=body.ticker, effective_at=at, recorded_at=now, qty_before=total, qty_added=added,
            detail=Jsonb({"positions": changes}), ledger_id=ledger_id, notice_index=notice, note=body.note.strip(),
        )  # fmt: skip
        payload = {
            "ticker": body.ticker, "company": await _company(conn, body.ticker), "qty_before": total,
            "qty_after": new_total, "ex_date": body.ex_date.isoformat(),
        }  # fmt: skip
        await append(conn, [_audit(actor, "bonus.recorded", rid, payload, now)], now=now)
        await _close_notice(conn, notice, now)
        await refresh_closes(conn, at)
        return await corporate_book(conn, now)


async def record_rights(
    conn: AsyncConnection[Any], body: RightsInput, actor: Actor, *, now: datetime
) -> dict[str, Any]:
    """POST /me/corporate/rights. 409 not_started / not_held, 422 over_cash / future_date."""
    _check_day(body.subscribed_on, now)
    notice = _notice_index(body.notice_id)
    price = Decimal(str(body.price))
    paid = cents(price * body.qty)
    async with conn.transaction():
        await ledger.lock(conn)
        book = await _require_started(conn, now)
        positions = await _positions(conn, body.ticker)
        if paid > book.free_cash:
            raise ApiError(422, "over_cash", OVER_CASH)
        first = positions[0]
        total = sum(int(p["qty"]) for p in positions)
        old_q, avg = int(first["qty"]), Decimal(first["avg_cost"])
        new_q = old_q + body.qty
        change = {
            "id": int(first["id"]), "qty_before": old_q, "avg_before": float(avg), "qty_after": new_q,
            "avg_after": float((avg * old_q + paid) / new_q),
        }  # fmt: skip
        at = _noon(body.subscribed_on, now)
        ledger_id = await ledger._insert(
            conn, kind="rights", occurred_at=at, recorded_at=now, amount_try=paid, cash_delta=-paid,
            ticker=body.ticker, qty_delta=body.qty, price=price, position_id=change["id"], note=body.note.strip(),
        )  # fmt: skip
        await _apply_positions(conn, [change], undo=False)
        rid = await _insert_record(
            conn, kind="rights", ticker=body.ticker, effective_at=at, recorded_at=now, net_try=paid, qty_before=total,
            qty_added=body.qty, price=price, detail=Jsonb({"positions": [change]}), ledger_id=ledger_id,
            notice_index=notice, note=body.note.strip(),
        )  # fmt: skip
        payload = {
            "ticker": body.ticker, "company": await _company(conn, body.ticker), "qty": body.qty,
            "price": float(price), "paid_try": float(paid),
        }  # fmt: skip
        await append(conn, [_audit(actor, "rights.recorded", rid, payload, now)], now=now)
        await _close_notice(conn, notice, now)
        await refresh_closes(conn, at)
        return await corporate_book(conn, now)


async def undo_record(conn: AsyncConnection[Any], record_id: str, actor: Actor, *, now: datetime) -> dict[str, Any]:
    """POST /me/corporate/{id}/undo: a correction row that reverses the record. 404 not_found, 409 already_undone /
    is_undo / changed."""
    rid = _record_id(record_id)
    async with conn.transaction():
        await ledger.lock(conn)
        rows = await _rows(conn, ONE_RECORD_SQL, (rid,))
        if not rows:
            raise ApiError(404, "not_found", NOT_FOUND)
        rec = rows[0]
        if rec["corrects_id"] is not None:
            raise ApiError(409, "is_undo", IS_UNDO)
        if (await _rows(conn, UNDONE_SQL, (rid,)))[0]["undone"]:
            raise ApiError(409, "already_undone", ALREADY_UNDONE)
        changes = rec["detail"].get("positions", [])
        if changes:
            await _check_unchanged(conn, rec["ticker"], changes)
        ledger_id = await _reverse_ledger(conn, rec, now)
        await _apply_positions(conn, changes, undo=True)
        new_id = await _insert_record(
            conn, kind=rec["kind"], ticker=rec["ticker"], effective_at=rec["effective_at"], recorded_at=now,
            net_try=rec["net_try"], gross_try=rec["gross_try"], qty_before=rec["qty_before"],
            qty_added=rec["qty_added"], price=rec["price"], ledger_id=ledger_id, corrects_id=rid,
        )  # fmt: skip
        payload = {"ticker": rec["ticker"], "company": await _company(conn, rec["ticker"]), "corrects": record_id}
        await append(conn, [_audit(actor, f"{rec['kind']}.corrected", new_id, payload, now)], now=now)
        await refresh_closes(conn, rec["effective_at"])
        return await corporate_book(conn, now)


async def _check_unchanged(conn: AsyncConnection[Any], ticker: str, changes: list[dict[str, Any]]) -> None:
    current = {int(p["id"]): int(p["qty"]) for p in await _rows(conn, POSITIONS_SQL, (ticker,))}
    if any(current.get(c["id"]) != c["qty_after"] for c in changes):
        raise ApiError(409, "changed", CHANGED)


async def _reverse_ledger(conn: AsyncConnection[Any], rec: dict[str, Any], at_now: datetime) -> int:
    """The same row with every delta turned round, at the moment of the original."""
    orig = (await _rows(conn, "SELECT * FROM trading.book_ledger WHERE id = %s", (rec["ledger_id"],)))[0]
    return await ledger._insert(
        conn, kind=orig["kind"], occurred_at=orig["occurred_at"], recorded_at=at_now, amount_try=orig["amount_try"],
        cash_delta=-orig["cash_delta"], ticker=orig["ticker"], qty_delta=-orig["qty_delta"], price=orig["price"],
        position_id=orig["position_id"], note="düzeltme",
    )  # fmt: skip
