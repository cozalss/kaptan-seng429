"""The person's money and the shares they already held: every write to the book that is not a ticket fill.

    start       the starting money (once)                    cash +amount, money put in +amount
    deposit     money put in later                           cash +amount, money put in +amount
    withdrawal  money taken out                              cash -amount, money put in -amount
    holding     a share owned before KAPtan (at its cost)    shares +qty, money put in +qty x avg_cost
    sell        a hand-entered holding sold                  shares -qty, cash +(qty x price - commission)

Each write takes the book lock, checks against the book as it is right now, writes the ledger (and for a
holding its position row) and one audit record (`money.started` / `money.deposited` / `money.withdrawn` /
`holding.added` / `holding.sold`) in the caller's transaction. A deposit, a withdrawal and a share added by
hand are outside flows: the day-start level and the peak are shifted by them (see `kaptan.risk.book`), so
none of them is a gain or a loss.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.api.deps import Actor
from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append
from kaptan.brokers import config as broker_config
from kaptan.brokers.costs import commission_of
from kaptan.domain.schemas.money import HoldingInput, HoldingSellInput, MoneyInput
from kaptan.portfolio import ledger
from kaptan.portfolio.ledger import cents
from kaptan.portfolio.marks import round_to
from kaptan.portfolio.positions import BOOK, ONE_SQL, position_view
from kaptan.prices.calendar import IST, istanbul_date
from kaptan.prices.reads import latest_marks
from kaptan.risk.book import own_book

ALREADY_STARTED: Final = "Başlangıç paranı zaten girdin. Para eklemek için 'Para ekle'yi kullan."
NOT_STARTED: Final = "Önce başlangıç paranı gir."
OVER_CASH: Final = "Kasandaki paradan fazlasını çekemezsin."
UNKNOWN_TICKER: Final = "Bu hisse kodunu tanımıyorum."
FUTURE_DAY: Final = "Gelecekteki bir tarihi giremezsin."
FUTURE_TIME: Final = "Gelecekteki bir zamanı giremezsin."
POSITION_NOT_FOUND: Final = "Pozisyon bulunamadı."
USE_TICKET: Final = "Bu pozisyonu önerinin işlem fişinden sat."
OVER_QTY: Final = "Elinde olandan fazlasını satamazsın."
AUDIT_ACTION: Final = {"start": "money.started", "deposit": "money.deposited", "withdrawal": "money.withdrawn"}

ISSUER_SQL: Final = "SELECT name FROM core.issuers WHERE ticker = %s"
HOLDING_INSERT_SQL: Final = """
INSERT INTO trading.positions (book, origin, ticker, company_name, qty, avg_cost, last_price, opened_at,
  planned_exit_date, source_proposal, run_id, event_type, strategy_version, realized_pnl)
VALUES ('personal', 'own', %s, %s, %s, %s, %s, %s, %s, NULL, NULL, NULL, '', 0) RETURNING id
"""
OWN_POSITION_SQL: Final = """
SELECT id, origin, ticker, company_name, qty, avg_cost, realized_pnl FROM trading.positions WHERE id = %s FOR UPDATE
"""


@dataclass(frozen=True, slots=True)
class MoneyOutcome:
    body: dict[str, Any] | None
    #: True when the starting money was just entered: the disclosure counters changed (waiting_for_money).
    counters_changed: bool = False


def _audit(actor: Actor, action: str, entity_id: str, payload: dict[str, Any], now: datetime) -> AuditDraft:
    return AuditDraft(actor.audit_actor, action, "book", entity_id, payload, occurred_at=now)


async def money_book(conn: AsyncConnection[Any], now: datetime) -> dict[str, Any]:
    """MoneyBook: free cash, the money put in so far and every movement, newest first."""
    book = await own_book(conn, now)
    return {"cash": float(book.cash), "put_in": float(book.put_in), "movements": await ledger.movements(conn)}


async def add_money(conn: AsyncConnection[Any], body: MoneyInput, actor: Actor, *, now: datetime) -> MoneyOutcome:
    """POST /me/money. 409 already_started / not_started, 422 over_cash."""
    amount = cents(body.amount_try)
    async with conn.transaction():
        await ledger.lock(conn)
        book = await own_book(conn, now)
        if body.kind == "start" and book.started:
            raise ApiError(409, "already_started", ALREADY_STARTED)
        if body.kind != "start" and not book.started:
            raise ApiError(409, "not_started", NOT_STARTED)
        if body.kind == "withdrawal" and amount > book.free_cash:
            raise ApiError(422, "over_cash", OVER_CASH)
        row_id = await ledger.add_money(
            conn, body.kind, amount, equity_before=book.equity, note=body.note.strip(), now=now
        )
        draft = _audit(actor, AUDIT_ACTION[body.kind], f"hareket-{row_id}", {"amount_try": float(amount)}, now)
        await append(conn, [draft], now=now)
        out = await money_book(conn, now)
    return MoneyOutcome(out, counters_changed=body.kind == "start")


async def _issuer_name(conn: AsyncConnection[Any], ticker: str) -> str:
    async with conn.cursor() as cur:
        await cur.execute(ISSUER_SQL, (ticker,))
        row = await cur.fetchone()
    if row is None:
        raise ApiError(422, "unknown_ticker", UNKNOWN_TICKER)
    return str(row["name"])


async def add_holding(conn: AsyncConnection[Any], body: HoldingInput, actor: Actor, *, now: datetime) -> dict[str, Any]:
    """POST /me/holdings: a share the person already owned joins the book at cost (cash is not touched).
    409 not_started, 422 unknown_ticker / future_date."""
    if body.bought_on > istanbul_date(now):
        raise ApiError(422, "future_date", FUTURE_DAY)
    avg = Decimal(str(body.avg_cost))
    async with conn.transaction():
        await ledger.lock(conn)
        book = await own_book(conn, now)
        if not book.started:
            raise ApiError(409, "not_started", NOT_STARTED)
        name = await _issuer_name(conn, body.ticker)
        mark = (await latest_marks(conn, [body.ticker], now)).get(body.ticker)
        worth = (Decimal(str(mark.price)) if mark is not None else avg) * body.qty
        opened = datetime.combine(body.bought_on, time(12, 0), IST)
        async with conn.cursor() as cur:
            await cur.execute(
                HOLDING_INSERT_SQL,
                (body.ticker, name, body.qty, float(avg), float(avg), opened, body.bought_on),
            )
            created = await cur.fetchone()
            assert created is not None
            await cur.execute(ONE_SQL, (created["id"],))
            row = await cur.fetchone()
        assert row is not None
        await ledger.add_holding(
            conn, ticker=body.ticker, qty=body.qty, avg_cost=avg, market_value=cents(worth),
            equity_before=book.equity, position_id=int(created["id"]), now=now,
        )  # fmt: skip
        payload = {"ticker": body.ticker, "company": name, "qty": body.qty, "avg_cost": float(avg)}
        await append(conn, [_audit(actor, "holding.added", f"pozisyon-{created['id']}", payload, now)], now=now)
    return position_view(row, now, mark)


def _position_id(value: str) -> int:
    head, _, tail = value.partition("-")
    if head != "pozisyon" or not tail.isdigit():
        raise ApiError(404, "not_found", POSITION_NOT_FOUND)
    return int(tail)


def _commission(body: HoldingSellInput, price: Decimal) -> tuple[Decimal, bool]:
    """What the person typed, else the cost model's estimate (commission + BSMV), flagged estimated."""
    if body.commission_try is not None:
        return cents(body.commission_try), False
    broker, bsmv = commission_of(price * body.qty, broker_config.current().trading.costs)
    return broker + bsmv, True


async def sell_holding(
    conn: AsyncConnection[Any], position_id: str, body: HoldingSellInput, actor: Actor, *, now: datetime
) -> dict[str, Any] | None:
    """POST /me/holdings/{position_id}/sell: a hand-entered holding sold at the person's bank. Returns the
    position left, or None when nothing is. 404 not_found, 409 use_ticket / not_started, 422 over_qty /
    future_time."""
    if body.sold_at > now:
        raise ApiError(422, "future_time", FUTURE_TIME)
    pid = _position_id(position_id)
    price = Decimal(str(body.price))
    async with conn.transaction():
        await ledger.lock(conn)
        async with conn.cursor() as cur:
            await cur.execute(OWN_POSITION_SQL, (pid,))
            pos = await cur.fetchone()
        if pos is None:
            raise ApiError(404, "not_found", POSITION_NOT_FOUND)
        if pos["origin"] != "own":
            raise ApiError(409, "use_ticket", USE_TICKET)
        if body.qty > int(pos["qty"]):
            raise ApiError(422, "over_qty", OVER_QTY)
        commission, estimated = _commission(body, price)
        await ledger.add_fill(
            conn, side="sell", ticker=pos["ticker"], qty=body.qty, price=price, commission=commission,
            estimated=estimated, filled_at=body.sold_at, now=now, position_id=pid,
        )  # fmt: skip
        left = int(pos["qty"]) - body.qty
        realized = round_to((float(price) - float(pos["avg_cost"])) * body.qty - float(commission), 2)
        async with conn.cursor() as cur:
            if left == 0:
                await cur.execute("DELETE FROM trading.positions WHERE id = %s", (pid,))
            else:
                await cur.execute(
                    "UPDATE trading.positions SET qty = %s, realized_pnl = realized_pnl + %s WHERE id = %s",
                    (left, realized, pid),
                )
        payload = {
            "ticker": pos["ticker"], "company": pos["company_name"], "qty": body.qty, "price": float(price),
            "commission_try": float(commission), "commission_estimated": estimated,
        }  # fmt: skip
        await append(conn, [_audit(actor, "holding.sold", position_id, payload, now)], now=now)
        if left == 0:
            return None
        async with conn.cursor() as cur:
            await cur.execute(ONE_SQL, (pid,))
            row = await cur.fetchone()
    assert row is not None
    mark = (await latest_marks(conn, [row["ticker"]], now)).get(row["ticker"])
    return position_view(row, now, mark)


__all__ = ["BOOK", "MoneyOutcome", "add_holding", "add_money", "money_book", "sell_holding"]
