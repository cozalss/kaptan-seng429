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
from kaptan.brokers.costs import commission_of
from kaptan.domain.schemas.money import HoldingInput, HoldingSellInput, MoneyInput, MovementCorrectInput
from kaptan.portfolio import fee, ledger
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
NOT_A_MOVEMENT: Final = "Bu hareketi bulamadım."
ALREADY_UNDONE: Final = "Bunu zaten geri aldın."
NO_CHANGE: Final = "Bu zaten böyle yazılı."
START_NOT_UNDOABLE: Final = (
    "Başlangıç parasını geri alamazsın; tutarını değiştirebilirsin. "
    "Hepsini silip yeniden başlamak için 'Baştan başla'yı kullan."
)
OVER_CASH_FIX: Final = (
    "Bu değişiklikle boştaki nakdin eksiye düşerdi. Önce bekleyen alım işlemini kapat ya da başka bir tutar yaz."
)
HAS_SALES: Final = "Bu hisseden sattığını kaydettin, o yüzden eklemeyi değiştiremezsin."
NEED_AMOUNT: Final = "Yeni tutarı yaz."
NEED_SHARE: Final = "Yeni adedi ve alış fiyatını yaz."
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


async def _commission(conn: AsyncConnection[Any], body: HoldingSellInput, price: Decimal) -> tuple[Decimal, bool]:
    """What the person typed, else the cost model's estimate (commission + BSMV, at the person's own rate when
    they entered one), flagged estimated."""
    if body.commission_try is not None:
        return cents(body.commission_try), False
    broker, bsmv = commission_of(price * body.qty, (await fee.in_force(conn)).costs)
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
        commission, estimated = await _commission(conn, body, price)
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


def _movement_id(value: str) -> int:
    head, _, tail = value.partition("-")
    if head != "hareket" or not tail.isdigit():
        raise ApiError(404, "not_found", NOT_A_MOVEMENT)
    return int(tail)


def _signed(kind: str, amount: Decimal) -> Decimal:
    return -amount if kind == "withdrawal" else amount


def _check_free_cash(book: Any, cash_delta: Decimal) -> None:
    """A fix may never leave the free cash (cash minus buy tickets waiting to be entered) below zero."""
    if cash_delta < 0 and book.cash + cash_delta - book.reserved < 0:
        raise ApiError(422, "over_cash", OVER_CASH_FIX)


async def _fixable(conn: AsyncConnection[Any], movement_id: str) -> dict[str, Any]:
    row = await ledger.original_row(conn, _movement_id(movement_id))
    if row is None or row["kind"] not in ledger.MOVEMENT_KINDS:
        raise ApiError(404, "not_found", NOT_A_MOVEMENT)
    if row["undone"]:
        raise ApiError(409, "already_undone", ALREADY_UNDONE)
    return row


async def _own_position(conn: AsyncConnection[Any], row: dict[str, Any]) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute(OWN_POSITION_SQL, (row["position_id"],))
        pos = await cur.fetchone()
    if pos is None or pos["origin"] != "own":
        raise ApiError(404, "not_found", POSITION_NOT_FOUND)
    if await ledger.hand_sales(conn, int(row["position_id"])):
        raise ApiError(409, "has_sales", HAS_SALES)
    return dict(pos)


async def _worth(conn: AsyncConnection[Any], ticker: str, qty: int, fallback: Decimal, now: datetime) -> Decimal:
    mark = (await latest_marks(conn, [ticker], now)).get(ticker)
    return cents((Decimal(str(mark.price)) if mark is not None else fallback) * qty)


async def correct_movement(
    conn: AsyncConnection[Any], movement_id: str, body: MovementCorrectInput, actor: Actor, *, now: datetime
) -> dict[str, Any]:
    """POST /me/money/{id}/correct: the amount of a movement was typed wrong. A new ledger row says which row it
    corrects and carries the difference, like a deposit (a plus or a minus): never a gain or a loss. 404 not_found,
    409 already_undone / has_sales, 422 over_cash / no_change / validation."""
    async with conn.transaction():
        await ledger.lock(conn)
        row = await _fixable(conn, movement_id)
        book = await own_book(conn, now)
        if row["kind"] == "holding":
            await _correct_holding(conn, row, body, actor, book, now)
        else:
            await _correct_money(conn, row, body, actor, book, now)
        return await money_book(conn, now)


async def _correct_money(
    conn: AsyncConnection[Any], row: dict[str, Any], body: MovementCorrectInput, actor: Actor, book: Any, now: datetime
) -> None:
    if body.amount_try is None:
        raise ApiError(422, "validation", NEED_AMOUNT)
    old = Decimal(row["corrected_to"] if row["corrected_to"] is not None else row["amount_try"])
    new = cents(body.amount_try)
    if new == old:
        raise ApiError(422, "no_change", NO_CHANGE)
    delta = _signed(row["kind"], new) - _signed(row["kind"], old)
    _check_free_cash(book, delta)
    await ledger.add_fix(
        conn, kind="correction", corrects_id=row["id"], occurred_at=now, recorded_at=now, amount_try=new,
        cash_delta=delta, capital_delta=delta, flow_try=delta, equity_before=book.equity, note=body.note.strip(),
    )  # fmt: skip
    payload = {"kind": row["kind"], "old_amount_try": float(old), "new_amount_try": float(new)}
    await append(conn, [_audit(actor, "money.corrected", f"hareket-{row['id']}", payload, now)], now=now)


async def _correct_holding(
    conn: AsyncConnection[Any], row: dict[str, Any], body: MovementCorrectInput, actor: Actor, book: Any, now: datetime
) -> None:
    if body.qty is None or body.avg_cost is None:
        raise ApiError(422, "validation", NEED_SHARE)
    if body.bought_on is not None and body.bought_on > istanbul_date(now):
        raise ApiError(422, "future_date", FUTURE_DAY)
    pos = await _own_position(conn, row)
    old_qty, old_avg = int(pos["qty"]), Decimal(str(pos["avg_cost"]))
    new_avg = Decimal(str(body.avg_cost))
    if (body.qty, new_avg) == (old_qty, old_avg) and body.bought_on is None:
        raise ApiError(422, "no_change", NO_CHANGE)
    old_cost, new_cost = cents(old_avg * old_qty), cents(new_avg * body.qty)
    worth_new = await _worth(conn, row["ticker"], body.qty, new_avg, now)
    worth_old = await _worth(conn, row["ticker"], old_qty, old_avg, now)
    await ledger.add_fix(
        conn, kind="correction", corrects_id=row["id"], occurred_at=now, recorded_at=now, amount_try=new_cost,
        cash_delta=Decimal(0), capital_delta=new_cost - old_cost, flow_try=worth_new - worth_old,
        equity_before=book.equity, ticker=row["ticker"], qty_delta=body.qty - old_qty, price=new_avg,
        position_id=row["position_id"], new_qty=body.qty,
    )  # fmt: skip
    opened = None if body.bought_on is None else datetime.combine(body.bought_on, time(12, 0), IST)
    async with conn.cursor() as cur:
        await cur.execute(
            "UPDATE trading.positions SET qty = %s, avg_cost = %s, last_price = %s,"
            " opened_at = coalesce(%s, opened_at), planned_exit_date = coalesce(%s, planned_exit_date) WHERE id = %s",
            (body.qty, float(new_avg), float(new_avg), opened, body.bought_on, pos["id"]),
        )
    payload = {
        "ticker": row["ticker"], "company": pos["company_name"],
        "old": {"qty": old_qty, "avg_cost": float(old_avg)}, "new": {"qty": body.qty, "avg_cost": float(new_avg)},
    }  # fmt: skip
    await append(conn, [_audit(actor, "holding.corrected", f"hareket-{row['id']}", payload, now)], now=now)


async def undo_movement(conn: AsyncConnection[Any], movement_id: str, actor: Actor, *, now: datetime) -> dict[str, Any]:
    """POST /me/money/{id}/undo: "Bunu yanlış girdim". A reversing row, never a delete; not a gain or a loss.
    404 not_found, 409 already_undone / cannot_undo_start / has_sales, 422 over_cash."""
    async with conn.transaction():
        await ledger.lock(conn)
        row = await _fixable(conn, movement_id)
        if row["kind"] == "start":
            raise ApiError(409, "cannot_undo_start", START_NOT_UNDOABLE)
        book = await own_book(conn, now)
        if row["kind"] == "holding":
            await _undo_holding(conn, row, actor, book, now)
        else:
            await _undo_money(conn, row, actor, book, now)
        return await money_book(conn, now)


async def _undo_money(conn: AsyncConnection[Any], row: dict[str, Any], actor: Actor, book: Any, now: datetime) -> None:
    amount = Decimal(row["corrected_to"] if row["corrected_to"] is not None else row["amount_try"])
    delta = -_signed(row["kind"], amount)
    _check_free_cash(book, delta)
    await ledger.add_fix(
        conn, kind="reversal", corrects_id=row["id"], occurred_at=now, recorded_at=now, amount_try=amount,
        cash_delta=delta, capital_delta=delta, flow_try=delta, equity_before=book.equity,
    )  # fmt: skip
    payload = {"kind": row["kind"], "amount_try": float(amount)}
    await append(conn, [_audit(actor, "money.undone", f"hareket-{row['id']}", payload, now)], now=now)


async def _undo_holding(
    conn: AsyncConnection[Any], row: dict[str, Any], actor: Actor, book: Any, now: datetime
) -> None:
    pos = await _own_position(conn, row)
    qty, avg = int(pos["qty"]), Decimal(str(pos["avg_cost"]))
    cost = cents(avg * qty)
    worth = await _worth(conn, row["ticker"], qty, avg, now)
    await ledger.add_fix(
        conn, kind="reversal", corrects_id=row["id"], occurred_at=now, recorded_at=now, amount_try=cost,
        cash_delta=Decimal(0), capital_delta=-cost, flow_try=-worth, equity_before=book.equity,
        ticker=row["ticker"], qty_delta=-qty, price=avg, position_id=row["position_id"],
    )  # fmt: skip
    async with conn.cursor() as cur:
        await cur.execute("DELETE FROM trading.positions WHERE id = %s", (pos["id"],))
    payload = {"ticker": row["ticker"], "company": pos["company_name"], "qty": qty, "avg_cost": float(avg)}
    await append(conn, [_audit(actor, "holding.undone", f"hareket-{row['id']}", payload, now)], now=now)


__all__ = [
    "BOOK",
    "MoneyOutcome",
    "add_holding",
    "add_money",
    "correct_movement",
    "money_book",
    "sell_holding",
    "undo_movement",
]
