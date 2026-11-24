"""The morning brief (FR-35, 04 `morning_brief`, 08:45): what the desk needs before the open, from DB facts.

Deterministic, no LLM: the same database and `now` give the same document. A MorningBrief JSON document
(domain/schemas/reports.py) with:
- important_disclosures / signals: the important disclosures (`kaptan.signal`) since the last session's close: all
  of mine (held first), then the newest few others, each with its line, tone and suggestion;
- orders_for_open: orders waiting for today's open (none on a running system: KAPtan places no order; the field
  stays so the document keeps its shape);
- pending_approvals / open_positions / expiring_today (planned exit date = today);
- risk_warnings: crisis regime, yesterday's result of the person's book;
- restriction_changes: tedbir/restriction rows that became known, or ended, since the last close;
- summary_tr: plain Turkish sentences built from the counts above (no finance jargon, nothing said that is not
  known: a new install with no money, no holdings and no result yet says only what exists)
Only data with `available_at <= now` is used (no look-ahead).
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.approvals.reads import _order_doc, list_cards
from kaptan.brief.missed import missed_note
from kaptan.disclosures.listing import LIST_ITEM_COLUMNS, list_item, to_item
from kaptan.domain.schemas._base import iso_ms
from kaptan.domain.schemas.reports import MorningBrief
from kaptan.portfolio.pnl import LIVE_STRATEGY
from kaptan.portfolio.positions import list_positions
from kaptan.prices.calendar import IST, CalendarRangeError, close_known_at, prev_session
from kaptan.rules.format import fmt_int, fmt_pct, fmt_try
from kaptan.signal import Signal, signals_between
from kaptan.signal.docs import item_doc, mine_first, triage_map

MAX_DISCLOSURES: Final = 30
MAX_RESTRICTIONS: Final = 50
MONTHS_TR: Final = (
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
)  # fmt: skip
WEEKDAYS_TR: Final = ("Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar")

MAX_OTHERS: Final = 5
NOTHING_IMPORTANT: Final = "Son kapanıştan bu yana önemli bir duyuru yok: bugün bakman gereken bir şey yok."
DISCLOSURES_SQL: Final = f"""
SELECT {LIST_ITEM_COLUMNS} FROM core.disclosures
 WHERE disclosure_index = ANY(%(ids)s)
 ORDER BY available_at DESC, disclosure_index DESC
"""  # noqa: S608 - constant column list, every value is bound
ORDERS_SQL: Final = """
SELECT o.id, o.client_order_id, o.proposal_id, o.run_id, o.ticker, o.company_name, o.side, o.order_type,
       o.tif, o.qty, o.limit_price, o.status, o.broker, o.cancel_reason, o.is_fixture, o.created_at,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
           'id', f.id, 'order_id', f.order_id, 'qty', f.qty, 'price', f.price, 'commission', f.commission,
           'bsmv', f.bsmv, 'slippage_bps', f.slippage_bps, 'filled_at', f.filled_at, 'source', f.source)
           ORDER BY f.filled_at, f.id)
         FROM trading.fills f WHERE f.order_id = o.id), '[]'::jsonb) AS fills
FROM trading.orders o
WHERE o.status = 'pending_open' AND o.created_at <= %(now)s
ORDER BY o.created_at, o.id
"""
RISK_SQL: Final = "SELECT regime FROM trading.risk_state WHERE id = 1"
REGIME_SQL: Final = "SELECT d, regime FROM trading.regime_daily WHERE d < %s ORDER BY d DESC LIMIT 1"
PNL_SQL: Final = """
SELECT d, equity, daily_return, drawdown FROM trading.pnl_daily WHERE strategy = %s AND d < %s
 ORDER BY d DESC LIMIT 1
"""
RESTRICTIONS_SQL: Final = """
SELECT ticker, kind, 'added' AS change, available_at AS at FROM core.restriction_events
 WHERE available_at > %(since)s AND available_at <= %(now)s
UNION ALL
SELECT ticker, kind, 'removed' AS change, (end_date + 1)::timestamp AT TIME ZONE 'Europe/Istanbul' AS at
  FROM core.restriction_events
 WHERE end_date IS NOT NULL AND available_at <= %(now)s AND end_date >= %(since_day)s AND end_date < %(day)s
ORDER BY at DESC, ticker, kind
LIMIT %(n)s
"""


async def brief_signals(conn: AsyncConnection[Any], since: datetime, now: datetime) -> list[Signal]:
    """The important disclosures since the last close: all of mine (held first), then the newest few others."""
    ranked = mine_first(await signals_between(conn, since, now, now=now))
    mine = [s for s in ranked if s.mine]
    return [*mine, *[s for s in ranked if not s.mine][:MAX_OTHERS]][:MAX_DISCLOSURES]


async def _all(conn: AsyncConnection[Any], sql: str, params: Any) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return [dict(r) for r in await cur.fetchall()]


def last_close(day: date) -> datetime:
    """When the previous session's close became known (the brief's "since" boundary)."""
    try:
        return close_known_at(prev_session(day))
    except CalendarRangeError:
        return datetime.combine(day - timedelta(days=1), time(18, 30), IST)


def date_tr(day: date) -> str:
    """2026-10-20 → "20 Ekim 2026 Salı"."""
    return f"{day.day} {MONTHS_TR[day.month - 1]} {day.year} {WEEKDAYS_TR[day.weekday()]}"


def risk_warnings(risk: dict[str, Any] | None, pnl: dict[str, Any] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if risk is not None and risk["regime"] == "crisis":
        out.append({"level": "warn", "text_tr": "Piyasa çok dalgalı: öneriler daha küçük tutulur."})
    if pnl is not None and float(pnl["daily_return"]) < 0:
        text = f"Önceki borsa gününde paran {fmt_pct(abs(float(pnl['daily_return'])), 2)} azaldı."
        out.append({"level": "info", "text_tr": text})
    return out


def _holdings_sentence(n_pos: int, n_exp: int) -> str:
    if not n_pos:
        return "Elinde KAPtan'ın bildiği hisse yok."
    text = f"Elinde {fmt_int(n_pos)} hisse var"
    return text + (f", bugün satış günü gelen: {fmt_int(n_exp)}." if n_exp else ".")


def _risk_sentence(risk: dict[str, Any] | None) -> str | None:
    if risk is None:
        return None
    said = [
        text for on, text in ((risk["regime"] == "crisis", "piyasa çok dalgalı, öneriler daha küçük tutulur"),) if on
    ]
    return f"{said[0][0].upper()}{said[0][1:]}{''.join(f'; {t}' for t in said[1:])}." if said else None


def summary_text(day: date, doc: dict[str, Any], risk: dict[str, Any] | None, pnl: dict[str, Any] | None) -> str:
    """Plain Turkish sentences from the brief's facts (no model, same input → same text)."""
    n_pending = len(doc["pending_approvals"])
    parts = [f"{date_tr(day)} sabah özeti."]
    parts.append(f"Onayını bekleyen {fmt_int(n_pending)} öneri var." if n_pending else "Onayını bekleyen öneri yok.")
    parts.append(_holdings_sentence(len(doc["open_positions"]), len(doc["expiring_today"])))
    stopped = _risk_sentence(risk)
    if stopped:
        parts.append(stopped)
    if pnl is not None:
        change = float(pnl["daily_return"])
        moved = "arttı" if change >= 0 else "azaldı"
        parts.append(
            f"Önceki borsa gününde ({date_tr(pnl['d'])}) paran {fmt_pct(abs(change), 2)} {moved}; "
            f"toplam {fmt_try(float(pnl['equity']))}, "
            f"en yüksek seviyesinden {fmt_pct(abs(float(pnl['drawdown'])), 1)} aşağıda."
        )
    n_res = len(doc["restriction_changes"])
    if n_res:
        parts.append(f"Bir hisseye getirilen ya da kalkan işlem kısıtı: {fmt_int(n_res)}.")
    n_mine = sum(1 for s in doc["signals"] if s["mine"])
    n_disc = len(doc["important_disclosures"])
    if not n_disc:
        parts.append(NOTHING_IMPORTANT)
    elif n_mine:
        parts.append(
            f"Son kapanıştan bu yana {fmt_int(n_disc)} önemli duyuru var; {fmt_int(n_mine)} tanesi senin hisselerinde."
        )
    else:
        parts.append(f"Son kapanıştan bu yana {fmt_int(n_disc)} önemli duyuru var; hiçbiri senin hisselerinde değil.")
    return " ".join(parts)


async def build_brief(
    conn: AsyncConnection[Any], day: date, now: datetime, *, live_marks: bool = False, redis: Any = None
) -> dict[str, Any]:
    """The MorningBrief of `day` as of `now` (validated; JSON-ready). `redis`: only the real morning run passes it
    (reading the carried-over count clears it)."""
    since = last_close(day)
    since_day = since.astimezone(IST).date()
    signals = await brief_signals(conn, since, now)
    disclosures = await _all(conn, DISCLOSURES_SQL, {"ids": [s.disclosure_index for s in signals]})
    triage = await triage_map(conn)
    orders = await _all(conn, ORDERS_SQL, {"now": now})
    cards = [c for c in await list_cards(conn, now=now) if c["status"] == "pending"]
    positions = await list_positions(conn, now, live=live_marks)
    risk_rows = await _all(conn, RISK_SQL, ())
    risk = risk_rows[0] if risk_rows else None
    pnl_rows = await _all(conn, PNL_SQL, (LIVE_STRATEGY, day))
    pnl = pnl_rows[0] if pnl_rows else None
    restrictions = await _all(
        conn,
        RESTRICTIONS_SQL,
        {"since": since, "now": now, "since_day": since_day, "day": day, "n": MAX_RESTRICTIONS},
    )
    doc: dict[str, Any] = {
        "date": day.isoformat(),
        "generated_at": iso_ms(now),
        "important_disclosures": [list_item(to_item(r)) for r in disclosures],
        "signals": [item_doc(s, triage) for s in signals],
        "missed_note_tr": await missed_note(conn, now, redis=redis),
        "orders_for_open": [_order_doc(r) for r in orders],
        "pending_approvals": cards,
        "open_positions": positions,
        "expiring_today": [p for p in positions if p["planned_exit_date"] == day.isoformat()],
        "risk_warnings": risk_warnings(risk, pnl),
        "restriction_changes": [
            {"ticker": r["ticker"], "kind": r["kind"], "change": r["change"], "at": iso_ms(r["at"])}
            for r in restrictions
        ],
        "is_sample": False,
    }
    doc["summary_tr"] = summary_text(day, doc, risk, pnl)
    return MorningBrief.model_validate(doc).model_dump(mode="json")
