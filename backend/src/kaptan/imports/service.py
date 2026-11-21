"""Statement import: what is new, what is already in the book, what conflicts, and writing only what the person ticked.

The file is never stored. The panel keeps the parsed table and sends it back with the confirmed column mapping;
every call here re-reads it from scratch, so nothing the browser says about a row is trusted.

Rows are written with the same audited functions the person's own entries use: a deposit or withdrawal (dated the
day it happened), a dividend (`portfolio.corporate`), a sale of a hand-entered holding (`portfolio.money`) and a
purchase made at the bank outside KAPtan (`holding.bought`: shares in, cash out with commission). Every written row
leaves its own audit record plus one `import.applied` summary, and its hash, so the same file twice adds nothing.

A row is "already recorded" when its hash is known OR the book already has the same thing the same day (same kind,
share, quantity, price within half a kuruş / same amount). A row is a conflict when the book cannot take it as it
stands: no starting money yet, a day before the book started or in the future, an unknown share, not enough cash, a
sale of more than the hand-entered holding, a sale of a share KAPtan suggested (that goes through its ticket), a
dividend on a share the book never held. Rows are judged oldest first, so a deposit that funds a later purchase
counts.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.api.deps import Actor
from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append
from kaptan.brokers.costs import commission_of
from kaptan.domain.schemas.corporate import DividendInput
from kaptan.domain.schemas.imports import (
    ImportApplyRequest,
    ImportMapping,
    ImportPreview,
    ImportRequest,
    ImportResult,
    ImportRow,
    RowStatus,
)
from kaptan.domain.schemas.money import HoldingSellInput
from kaptan.imports.normalize import Parsed, header_key, row_hashes, rows_of
from kaptan.portfolio import corporate, fee, ledger, money
from kaptan.portfolio.ledger import cents
from kaptan.prices.calendar import IST, istanbul_date
from kaptan.risk.book import own_book

KIND_ORDER: Final = {"deposit": 0, "buy": 1, "dividend": 2, "sell": 3, "withdrawal": 4}
AUDIT_MONEY: Final = {"deposit": "money.deposited", "withdrawal": "money.withdrawn"}
NOT_STARTED: Final = "Önce başlangıç paranı gir; sonra dökümü yükleyebilirsin."
BEFORE_START: Final = (
    "Bu, KAPtan'a başladığın günden önce. O günlerden önceki hisselerini “Elimdeki hisse” olarak elle ekle."
)
FUTURE: Final = "Bu tarih bugünden sonra."
UNKNOWN_TICKER: Final = "Bu hisse kodunu tanımıyorum."
OVER_CASH: Final = "Bunun için yeterli nakit paran görünmüyor. Önce para eklediğini kaydet."
NOT_HELD: Final = "Elinde bu kadar yok. Önce aldığını kaydet ya da elindeki hisseyi elle ekle."
USE_TICKET: Final = "Bu hisse KAPtan'ın önerisinden. Satışı işlem fişinden kaydet."
NEVER_HELD: Final = "Bu hisse defterinde hiç yok."
ALREADY_IN_BOOK: Final = "Defterinde aynısı zaten var."
ALREADY_IMPORTED: Final = "Bu satırı daha önce aktardın."
NOTE: Final = "Dökümden aktarıldı: "

HASHES_SQL: Final = """
SELECT row_hash FROM trading.import_rows
 WHERE row_hash = ANY(%s) AND book_no = (SELECT max(no) FROM trading.book_epochs)
"""
START_SQL: Final = """
SELECT min(occurred_at) AS at FROM trading.book_ledger
 WHERE kind = 'start' AND book_no = (SELECT max(no) FROM trading.book_epochs)
"""
TICKERS_SQL: Final = "SELECT ticker, name FROM core.issuers WHERE ticker = ANY(%s)"
EVER_SQL: Final = """
SELECT DISTINCT ticker FROM trading.book_ledger
 WHERE ticker = ANY(%s) AND book_no = (SELECT max(no) FROM trading.book_epochs)
"""
POSITIONS_SQL: Final = """
SELECT id, ticker, origin, qty FROM trading.positions WHERE book = 'personal' AND ticker = ANY(%s)
 ORDER BY opened_at, id
"""
SIMILAR_SQL: Final = """
SELECT kind, ticker, abs(qty_delta) AS qty, price, amount_try, occurred_at FROM trading.book_ledger
 WHERE book_no = (SELECT max(no) FROM trading.book_epochs) AND corrects_id IS NULL
   AND kind IN ('buy', 'sell', 'deposit', 'withdrawal', 'dividend')
   AND occurred_at >= %s AND occurred_at < %s
"""
OWN_BY_TICKER_SQL: Final = """
SELECT id, qty, avg_cost FROM trading.positions
 WHERE book = 'personal' AND origin = 'own' AND ticker = %s ORDER BY opened_at, id LIMIT 1 FOR UPDATE
"""
INSERT_HASH_SQL: Final = """
INSERT INTO trading.import_rows (book_no, row_hash, source, kind, applied_at)
VALUES ((SELECT max(no) FROM trading.book_epochs), %s, %s, %s, %s) ON CONFLICT DO NOTHING
"""
SAVE_MAPPING_SQL: Final = """
INSERT INTO trading.import_mappings (source, mapping, header_key, updated_at) VALUES (%s, %s, %s, %s)
ON CONFLICT (source) DO UPDATE SET mapping = EXCLUDED.mapping, header_key = EXCLUDED.header_key,
  updated_at = EXCLUDED.updated_at
"""
OWN_LOCK_SQL: Final = """
SELECT id, qty FROM trading.positions
 WHERE book = 'personal' AND origin = 'own' AND ticker = %s ORDER BY opened_at, id FOR UPDATE
"""
LOAD_MAPPING_SQL: Final = "SELECT mapping, header_key FROM trading.import_mappings WHERE source = %s"
SOURCES_SQL: Final = "SELECT source FROM trading.import_mappings ORDER BY updated_at DESC LIMIT 50"
HOLDING_INSERT_SQL: Final = money.HOLDING_INSERT_SQL


@dataclass(frozen=True, slots=True)
class Judged:
    parsed: Parsed
    status: RowStatus
    reason: str
    commission: Decimal | None
    estimated: bool = False


async def _rows(conn: AsyncConnection[Any], sql: str, params: Any = ()) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return [dict(r) for r in await cur.fetchall()]


async def saved_mapping(conn: AsyncConnection[Any], source: str) -> tuple[ImportMapping, str] | None:
    rows = await _rows(conn, LOAD_MAPPING_SQL, (source,))
    return None if not rows else (ImportMapping.model_validate(rows[0]["mapping"]), str(rows[0]["header_key"]))


async def sources(conn: AsyncConnection[Any]) -> list[str]:
    return [str(r["source"]) for r in await _rows(conn, SOURCES_SQL)]


@dataclass(frozen=True, slots=True)
class Facts:
    """What the book looks like right now, as far as a statement row needs."""

    started: bool
    start_day: Any
    today: Any
    cash: Decimal
    names: dict[str, str]
    ever: set[str]
    own: dict[str, int]
    other: dict[str, int]
    known: set[str]
    similar: list[dict[str, Any]]
    costs: Any


async def _facts(conn: AsyncConnection[Any], parsed: list[Parsed], hashes: dict[int, str], now: datetime) -> Facts:
    book = await own_book(conn, now)
    tickers = sorted({r.ticker for r in parsed if r.ticker})
    start = (await _rows(conn, START_SQL))[0]["at"]
    days = [r.day for r in parsed if r.day]
    similar: list[dict[str, Any]] = []
    if days:
        lo = datetime.combine(min(days), time.min, IST)
        hi = datetime.combine(max(days), time.max, IST)
        similar = await _rows(conn, SIMILAR_SQL, (lo, hi))
    own: dict[str, int] = {}
    other: dict[str, int] = {}
    for p in await _rows(conn, POSITIONS_SQL, (tickers,)):
        target = own if p["origin"] == "own" else other
        target[p["ticker"]] = target.get(p["ticker"], 0) + int(p["qty"])
    known = {r["row_hash"] for r in await _rows(conn, HASHES_SQL, (list(hashes.values()),))}
    return Facts(
        book.started,
        None if start is None else istanbul_date(start),
        istanbul_date(now),
        book.free_cash,
        {r["ticker"]: r["name"] for r in await _rows(conn, TICKERS_SQL, (tickers,))},
        {r["ticker"] for r in await _rows(conn, EVER_SQL, (tickers,))},
        own,
        other,
        known,
        similar,
        (await fee.in_force(conn)).costs,
    )


def _matches_book(r: Parsed, similar: list[dict[str, Any]]) -> bool:
    for s in similar:
        if s["kind"] != r.kind or istanbul_date(s["occurred_at"]) != r.day:
            continue
        if r.kind in ("buy", "sell"):
            if (
                s["ticker"] == r.ticker
                and int(s["qty"]) == r.qty
                and r.price is not None
                and abs(Decimal(s["price"]) - r.price) <= Decimal("0.005")
            ):
                return True
        elif r.kind == "dividend":
            if s["ticker"] == r.ticker and cents(s["amount_try"]) == cents(r.amount or 0):
                return True
        elif cents(s["amount_try"]) == cents(r.amount or 0):
            return True
    return False


def _commission(r: Parsed, facts: Facts) -> tuple[Decimal, bool]:
    """What the row says, else the cost model's estimate (flagged)."""
    if r.commission is not None:
        return cents(r.commission), False
    assert r.price is not None and r.qty is not None
    broker, bsmv = commission_of(r.price * r.qty, facts.costs)
    return broker + bsmv, True


class _Sim:
    """The book as the rows would leave it, one new row after the other."""

    def __init__(self, facts: Facts) -> None:
        self.f = facts
        self.cash = facts.cash
        self.own = dict(facts.own)
        self.held = set(facts.ever)

    def _gate(self, r: Parsed) -> str:
        f = self.f
        if not f.started or f.start_day is None:
            return NOT_STARTED
        if r.day is not None and r.day > f.today:
            return FUTURE
        if r.day is not None and r.day < f.start_day:
            return BEFORE_START
        if r.ticker and r.ticker not in f.names:
            return UNKNOWN_TICKER
        return ""

    def take(self, r: Parsed) -> tuple[str, Decimal | None, bool]:
        """(reason it conflicts or "", commission, estimated); on success the simulated book moves on."""
        bad = self._gate(r)
        if bad:
            return bad, None, False
        if r.kind in ("buy", "sell"):
            assert r.qty is not None and r.price is not None
            commission, est = _commission(r, self.f)
            gross = r.price * r.qty
            if r.kind == "buy":
                if gross + commission > self.cash:
                    return OVER_CASH, commission, est
                self.cash -= gross + commission
                self.own[r.ticker or ""] = self.own.get(r.ticker or "", 0) + r.qty
                self.held.add(r.ticker or "")
                return "", commission, est
            if self.own.get(r.ticker or "", 0) < r.qty:
                return (USE_TICKET if self.f.other.get(r.ticker or "", 0) > 0 else NOT_HELD), commission, est
            self.own[r.ticker or ""] -= r.qty
            self.cash += gross - commission
            return "", commission, est
        amount = r.amount or Decimal(0)
        if r.kind == "withdrawal":
            if amount > self.cash:
                return OVER_CASH, None, False
            self.cash -= amount
        elif r.kind == "deposit":
            self.cash += amount
        elif (r.ticker or "") not in self.held:
            return NEVER_HELD, None, False
        else:
            self.cash += amount
        return "", None, False


def _judge(parsed: list[Parsed], hashes: dict[int, str], facts: Facts) -> list[Judged]:
    out: dict[int, Judged] = {}
    fresh: list[Parsed] = []
    for r in parsed:
        if r.skipped:
            out[r.index] = Judged(r, "skipped", r.error, None)
        elif r.error:
            out[r.index] = Judged(r, "invalid", r.error, None)
        elif hashes[r.index] in facts.known:
            out[r.index] = Judged(r, "recorded", ALREADY_IMPORTED, None)
        elif _matches_book(r, facts.similar):
            out[r.index] = Judged(r, "recorded", ALREADY_IN_BOOK, None)
        else:
            fresh.append(r)
    sim = _Sim(facts)
    for r in sorted(fresh, key=lambda x: (x.moment, KIND_ORDER[x.kind or "deposit"], x.index)):
        why, commission, est = sim.take(r)
        out[r.index] = Judged(r, "conflict" if why else "new", why, commission, est)
    return [out[r.index] for r in parsed]


def _view(j: Judged) -> ImportRow:
    r = j.parsed
    commission = j.commission if j.commission is not None else r.commission
    return ImportRow(
        index=r.index,
        date=r.day,
        kind=r.kind,
        ticker=r.ticker,
        qty=r.qty,
        price=None if r.price is None else float(r.price),
        commission_try=None if commission is None else float(commission),
        amount_try=None if r.amount is None else float(r.amount),
        status=j.status,
        reason=j.reason,
    )


def _preview(judged: list[Judged], parsed: list[Parsed], started: bool) -> ImportPreview:
    count = {s: sum(j.status == s for j in judged) for s in ("new", "recorded", "conflict", "invalid", "skipped")}
    unknown = sorted({r.unknown_type for r in parsed if r.unknown_type})
    return ImportPreview(rows=[_view(j) for j in judged], unknown_types=unknown, started=started, **count)


async def preview(conn: AsyncConnection[Any], body: ImportRequest, *, now: datetime) -> ImportPreview:
    """POST /me/import/preview: the rows understood and judged against the book. Writes nothing."""
    parsed = rows_of([list(r) for r in body.rows], body.mapping, body.number_style)
    hashes = row_hashes(parsed)
    facts = await _facts(conn, parsed, hashes, now)
    return _preview(_judge(parsed, hashes, facts), parsed, facts.started)


def _draft(actor: Actor, action: str, entity: str, payload: dict[str, Any], now: datetime) -> AuditDraft:
    return AuditDraft(actor.audit_actor, action, "book", entity, payload, occurred_at=now)


async def _write_money(conn: AsyncConnection[Any], j: Judged, source: str, actor: Actor, now: datetime) -> None:
    r = j.parsed
    assert r.kind in ("deposit", "withdrawal") and r.amount is not None and r.moment is not None
    at = min(r.moment, now)
    amount = cents(r.amount)
    book = await own_book(conn, now)
    if r.kind == "withdrawal" and amount > book.free_cash:
        raise ApiError(422, "over_cash", OVER_CASH)
    before = (await own_book(conn, at)).equity
    row_id = await ledger.add_money(
        conn, r.kind, amount, equity_before=before, note=NOTE + source, now=now, occurred_at=at
    )
    payload = {"amount_try": float(amount), "imported": True, "date": str(r.day)}
    await append(conn, [_draft(actor, AUDIT_MONEY[r.kind], f"hareket-{row_id}", payload, now)], now=now)


async def _write_buy(
    conn: AsyncConnection[Any], j: Judged, source: str, actor: Actor, now: datetime, name: str
) -> None:
    r = j.parsed
    assert r.qty and r.price is not None and r.moment is not None and j.commission is not None and r.ticker
    at = min(r.moment, now)
    book = await own_book(conn, now)
    if r.price * r.qty + j.commission > book.free_cash:
        raise ApiError(422, "over_cash", OVER_CASH)
    rows = await _rows(conn, OWN_BY_TICKER_SQL, (r.ticker,))
    async with conn.cursor() as cur:
        if rows:
            pid = int(rows[0]["id"])
            total = int(rows[0]["qty"]) + r.qty
            avg = (Decimal(rows[0]["avg_cost"]) * int(rows[0]["qty"]) + r.price * r.qty) / total
            await cur.execute(
                "UPDATE trading.positions SET qty = %s, avg_cost = %s, last_price = %s WHERE id = %s",
                (total, float(avg), float(r.price), pid),
            )
        else:
            await cur.execute(HOLDING_INSERT_SQL, (r.ticker, name, r.qty, float(r.price), float(r.price), at, r.day))
            created = await cur.fetchone()
            assert created is not None
            pid = int(created["id"])
    await ledger.add_fill(
        conn,
        side="buy",
        ticker=r.ticker,
        qty=r.qty,
        price=r.price,
        commission=j.commission,
        estimated=j.estimated,
        filled_at=at,
        now=now,
        position_id=pid,
    )
    payload = {
        "ticker": r.ticker,
        "company": name,
        "qty": r.qty,
        "price": float(r.price),
        "commission_try": float(j.commission),
        "commission_estimated": j.estimated,
        "imported": True,
    }
    await append(conn, [_draft(actor, "holding.bought", f"pozisyon-{pid}", payload, now)], now=now)


async def _write_sell(conn: AsyncConnection[Any], j: Judged, actor: Actor, now: datetime) -> None:
    r = j.parsed
    assert r.qty and r.price is not None and r.moment is not None and r.ticker
    left = r.qty
    commission = None if j.estimated or j.commission is None else float(j.commission)
    for p in await _rows(
        conn,
        OWN_LOCK_SQL,
        (r.ticker,),
    ):
        take = min(left, int(p["qty"]))
        body = HoldingSellInput(qty=take, price=float(r.price), sold_at=min(r.moment, now), commission_try=commission)
        await money.sell_holding(conn, f"pozisyon-{p['id']}", body, actor, now=now)
        commission = None if commission is None else 0.0
        left -= take
        if left == 0:
            return
    raise ApiError(422, "over_qty", NOT_HELD)


async def _write(
    conn: AsyncConnection[Any], j: Judged, facts_names: dict[str, str], source: str, actor: Actor, now: datetime
) -> None:
    r = j.parsed
    if r.kind in ("deposit", "withdrawal"):
        await _write_money(conn, j, source, actor, now)
    elif r.kind == "buy":
        await _write_buy(conn, j, source, actor, now, facts_names[r.ticker or ""])
    elif r.kind == "sell":
        await _write_sell(conn, j, actor, now)
    else:
        assert r.ticker and r.amount is not None and r.day is not None
        note = (NOTE + source)[:200]
        await corporate.record_dividend(
            conn, DividendInput(ticker=r.ticker, net_try=float(r.amount), received_on=r.day, note=note), actor, now=now
        )


async def apply(conn: AsyncConnection[Any], body: ImportApplyRequest, actor: Actor, *, now: datetime) -> ImportResult:
    """POST /me/import/apply: writes the ticked rows that are still new, each in its own savepoint (a row that
    cannot be written is reported, the rest go through), then remembers the mapping under the source name."""
    parsed = rows_of([list(r) for r in body.rows], body.mapping, body.number_style)
    hashes = row_hashes(parsed)
    chosen = set(body.selected)
    written: list[Judged] = []
    failed: list[ImportRow] = []
    async with conn.transaction():
        await ledger.lock(conn)
        facts = await _facts(conn, parsed, hashes, now)
        judged = _judge(parsed, hashes, facts)
        todo = [j for j in judged if j.status == "new" and j.parsed.index in chosen]
        for j in sorted(todo, key=lambda x: (x.parsed.moment, KIND_ORDER[x.parsed.kind or "deposit"], x.parsed.index)):
            try:
                async with conn.transaction():
                    await _write(conn, j, facts.names, body.source, actor, now)
                    await conn.execute(INSERT_HASH_SQL, (hashes[j.parsed.index], body.source, j.parsed.kind, now))
                written.append(j)
            except ApiError as err:
                failed.append(_view(Judged(j.parsed, "conflict", err.detail, j.commission)))
        await conn.execute(
            SAVE_MAPPING_SQL,
            (body.source, Jsonb(body.mapping.model_dump(mode="json")), header_key([list(r) for r in body.rows]), now),
        )
        if written:
            counts: dict[str, int] = {}
            for j in written:
                counts[j.parsed.kind or ""] = counts.get(j.parsed.kind or "", 0) + 1
            payload = {"source": body.source, "written": len(written), "kinds": counts}
            await append(conn, [_draft(actor, "import.applied", "dokum", payload, now)], now=now)
        facts_after = await _facts(conn, parsed, hashes, now)
        after = _preview(_judge(parsed, hashes, facts_after), parsed, facts_after.started)
    return ImportResult(written=len(written), failed=failed, preview=after)


__all__ = ["apply", "preview", "saved_mapping", "sources"]
