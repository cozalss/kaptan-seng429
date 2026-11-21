"""Price alerts: "tell me when this share reaches a price" (Ayarlar · Fiyat uyarıları, company page button).

An alert waits for a level: `above` fires when the latest price is at or over it, `below` when at or under it. A
preset (+-5 % / +-10 %) is turned into a level once, from the price KAPtan has when the alert is made; the level is
what is stored and shown. Prices are the freshest KAPtan has (`latest_quote`: Yahoo intraday, about 15 minutes late,
or the latest daily close), never a guess: with no price the alert simply waits.

`check_alerts` runs from the scheduler (after the quotes job): a firing alert is stamped and audited in one
transaction, then (after the commit) shown on this computer through the desk stream (that event names the company:
it never leaves the PC) and announced to the phone as the fixed sentence "bir fiyat uyarın tetiklendi" (no
ticker, no price, no direction). An alert fires once. Making and removing an alert is audited too.
"""

from __future__ import annotations

import logging
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Final

from kaptan.alerts.announce import announce
from kaptan.alerts.config import AlertConfig
from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append, user_actor
from kaptan.companies.watch import KNOWN_SQL
from kaptan.db import DictConn
from kaptan.domain.schemas._base import iso_ms
from kaptan.events.publish import publish
from kaptan.prices.intraday import latest_quote
from kaptan.reference._sql import execute, fetch_all, fetch_one

log = logging.getLogger("kaptan.alerts")

MAX_OPEN: Final = 30
CENT: Final = Decimal("0.0001")
ENTITY: Final = "price_alert"
SYSTEM_ACTOR: Final = "system:price_alerts"

NAME_SQL: Final = """
SELECT coalesce(p.name, i.name, (SELECT company_name FROM core.disclosures d WHERE d.primary_ticker = %(t)s
                                  ORDER BY published_at DESC LIMIT 1), %(t)s) AS name
  FROM (SELECT 1) one
  LEFT JOIN core.issuer_profiles p ON p.ticker = %(t)s
  LEFT JOIN core.issuers i ON i.ticker = %(t)s
"""
LIST_SQL: Final = """
SELECT id, ticker, direction, level, preset_pct, created_at, triggered_at, triggered_price
  FROM core.price_alerts ORDER BY (triggered_at IS NOT NULL), created_at DESC, id DESC
"""
OPEN_SQL: Final = "SELECT id, ticker, direction, level FROM core.price_alerts WHERE triggered_at IS NULL ORDER BY id"
FIRE_SQL: Final = """
UPDATE core.price_alerts SET triggered_at = %s, triggered_price = %s WHERE id = %s AND triggered_at IS NULL
"""


def level_for(direction: str, preset_pct: int, base: Decimal) -> Decimal:
    """The level a preset means: `base` moved by that percent, up for `above`, down for `below`. Pure."""
    factor = Decimal(100 + preset_pct) if direction == "above" else Decimal(100 - preset_pct)
    return (base * factor / Decimal(100)).quantize(CENT, rounding=ROUND_HALF_UP)


def is_hit(direction: str, level: Decimal, price: Decimal) -> bool:
    """True when `price` has reached `level` in the alert's direction. Pure."""
    return price >= level if direction == "above" else price <= level


async def _name(conn: DictConn, ticker: str) -> str:
    row = await fetch_one(conn, NAME_SQL, {"t": ticker})
    return str(row["name"]) if row else ticker


async def create_alert(
    conn: DictConn, ticker: str, direction: str, *, level: float | None, preset_pct: int | None, uid: str, now: datetime
) -> int:
    """Make an alert; returns its id. 404 for an unknown code, 409 when full / no price for a preset, 422 when the
    typed level is already passed (it would fire at once)."""
    async with conn.transaction():
        if await fetch_one(conn, KNOWN_SQL, {"t": ticker}) is None:
            raise ApiError(404, "not_found", "Bu kodla bir şirket bulamadım.")
        count = await fetch_one(conn, "SELECT count(*) AS n FROM core.price_alerts WHERE triggered_at IS NULL")
        if count is not None and int(count["n"]) >= MAX_OPEN:
            raise ApiError(409, "alerts_full", f"En fazla {MAX_OPEN} açık fiyat uyarın olabilir. Birini kaldır.")
        quote = await latest_quote(conn, ticker, now)
        base = quote.price if quote is not None else None
        if preset_pct is not None:
            if base is None:
                raise ApiError(
                    409,
                    "no_price",
                    "Bu hisse için henüz bir fiyatım yok; yüzdeyle uyarı kuramıyorum. Bir fiyat yazarak dene.",
                )
            target = level_for(direction, preset_pct, base)
        else:
            if level is None:
                raise ApiError(422, "validation", "Bir fiyat yaz ya da yüzde 5 / yüzde 10 seç.")
            target = Decimal(str(level)).quantize(CENT, rounding=ROUND_HALF_UP)
            if base is not None and is_hit(direction, target, base):
                raise ApiError(
                    422,
                    "already_passed",
                    "Hisse bu fiyata şimdiden gelmiş. Uyarı hemen tetiklenirdi; farklı bir fiyat yaz.",
                )
        row = await fetch_one(
            conn,
            "INSERT INTO core.price_alerts (ticker, direction, level, preset_pct, base_price, created_at) "
            "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
            (ticker, direction, target, preset_pct, base if preset_pct is not None else None, now),
        )
        if row is None:
            raise ApiError(500, "internal", "Uyarı kaydedilemedi.")
        draft = AuditDraft(
            user_actor(uid),
            "price_alert.created",
            ENTITY,
            str(row["id"]),
            {"ticker": ticker, "direction": direction, "level": float(target), "preset_pct": preset_pct},
            occurred_at=now,
        )
        await append(conn, [draft], now=now)
        return int(row["id"])


async def remove_alert(conn: DictConn, alert_id: int, *, uid: str, now: datetime) -> None:
    """Remove an alert (fired or not). 404 when it is not there."""
    async with conn.transaction():
        row = await fetch_one(conn, "SELECT ticker FROM core.price_alerts WHERE id = %s FOR UPDATE", (alert_id,))
        if row is None:
            raise ApiError(404, "not_found", "Bu uyarıyı bulamadım.")
        await execute(conn, "DELETE FROM core.price_alerts WHERE id = %s", (alert_id,))
        draft = AuditDraft(
            user_actor(uid), "price_alert.removed", ENTITY, str(alert_id), {"ticker": row["ticker"]}, occurred_at=now
        )
        await append(conn, [draft], now=now)


async def list_alerts(conn: DictConn, now: datetime) -> list[dict[str, Any]]:
    """Every alert with the company name and the price KAPtan has now (null = none), open ones first."""
    out: list[dict[str, Any]] = []
    prices: dict[str, Any] = {}
    for r in await fetch_all(conn, LIST_SQL):
        t = str(r["ticker"])
        if t not in prices:
            prices[t] = await latest_quote(conn, t, now)
        q = prices[t]
        paid = r["triggered_price"]
        out.append(
            {
                "id": str(r["id"]),
                "ticker": t,
                "name": await _name(conn, t),
                "direction": r["direction"],
                "level": float(r["level"]),
                "preset_pct": r["preset_pct"],
                "created_at": r["created_at"],
                "triggered_at": r["triggered_at"],
                "triggered_price": None if paid is None else float(paid),
                "current_price": None if q is None else float(q.price),
                "current_at": None if q is None else q.traded_at,
            }
        )
    return out


async def open_tickers(conn: DictConn) -> list[str]:
    """The companies with a waiting alert (their prices are fetched with the held ones)."""
    rows = await fetch_all(conn, "SELECT DISTINCT ticker FROM core.price_alerts WHERE triggered_at IS NULL")
    return sorted(str(r["ticker"]) for r in rows)


async def check_alerts(conn: DictConn, now: datetime, *, redis: Any, pool: Any, cfg: AlertConfig) -> int:
    """Fire every waiting alert whose price has been reached; returns how many fired."""
    waiting = await fetch_all(conn, OPEN_SQL)
    await conn.rollback()
    fired: list[dict[str, Any]] = []
    for r in waiting:
        quote = await latest_quote(conn, str(r["ticker"]), now)
        if quote is None or not is_hit(str(r["direction"]), Decimal(r["level"]), quote.price):
            continue
        async with conn.transaction():
            if await execute(conn, FIRE_SQL, (now, quote.price, r["id"])) == 0:
                continue
            payload = {
                "ticker": r["ticker"],
                "direction": r["direction"],
                "level": float(r["level"]),
                "price": float(quote.price),
            }
            draft = AuditDraft(SYSTEM_ACTOR, "price_alert.triggered", ENTITY, str(r["id"]), payload, occurred_at=now)
            await append(conn, [draft], now=now)
        fired.append(
            {
                **payload,
                "id": str(r["id"]),
                "name": await _name(conn, str(r["ticker"])),
                "level": float(r["level"]),
                "at": iso_ms(now),
            }
        )
    await conn.commit()
    for event in fired:
        await publish(redis, "desk", "price_alert", event)
    if fired:
        await announce(pool, redis, cfg, "price", now=now)
    return len(fired)
