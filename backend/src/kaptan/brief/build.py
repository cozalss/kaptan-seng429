"""The morning brief (FR-35, 04 `morning_brief`, 08:45): what the desk needs before the open, from DB facts.

Deterministic, no LLM: the same database and `now` give the same document. A MorningBrief JSON document
(domain/schemas/reports.py) with:
- important_disclosures: visible KAP rows that became known since the last session's close (not noise);
- orders_for_open: SimBIST orders waiting for today's open;
- pending_approvals / open_positions / expiring_today (planned exit date = today);
- risk_warnings: kill switch, daily halt, crisis regime, yesterday's P&L of the live strategy;
- restriction_changes: tedbir/restriction rows that became known, or ended, since the last close;
- summary_tr: plain Turkish sentences built from the counts above.
Only data with `available_at <= now` is used (no look-ahead).
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.approvals.reads import _order_doc, list_cards
from kaptan.demo.ticker import LIST_ITEM_COLUMNS, list_item
from kaptan.domain.schemas._base import iso_ms
from kaptan.domain.schemas.reports import MorningBrief
from kaptan.portfolio.pnl import LIVE_STRATEGY
from kaptan.portfolio.positions import list_positions
from kaptan.prices.calendar import IST, CalendarRangeError, close_known_at, prev_session
from kaptan.rules.format import fmt_int, fmt_pct, fmt_signed_pct, fmt_try

MAX_DISCLOSURES: Final = 30
MAX_RESTRICTIONS: Final = 50
MONTHS_TR: Final = (
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
)  # fmt: skip
WEEKDAYS_TR: Final = ("Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar")

DISCLOSURES_SQL: Final = f"""
SELECT {LIST_ITEM_COLUMNS} FROM core.disclosures
 WHERE visible AND NOT is_noise AND available_at > %(since)s AND available_at <= %(now)s
 ORDER BY available_at DESC, disclosure_index DESC
 LIMIT %(n)s
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
RISK_SQL: Final = "SELECT kill_switch, kill_reason, halted_today, regime FROM trading.risk_state WHERE id = 1"
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
    if risk is not None:
        if risk["kill_switch"] == "on":
            reason = f" ({risk['kill_reason']})" if risk.get("kill_reason") else ""
            out.append({"level": "critical", "text_tr": f"Acil durdurma açık{reason}: yeni emir gönderilmez."})
        if risk["halted_today"]:
            out.append({"level": "warn", "text_tr": "Günlük zarar durdurması sürüyor: bugün yeni alım yapılmaz."})
        if risk["regime"] == "crisis":
            out.append({"level": "warn", "text_tr": "Piyasa rejimi kriz: pozisyon büyüklükleri düşürülür."})
    if pnl is not None and float(pnl["daily_return"]) < 0:
        text = f"Önceki seansın getirisi {fmt_signed_pct(float(pnl['daily_return']), 2)}."
        level = "warn" if float(pnl["drawdown"]) <= -0.025 else "info"
        out.append({"level": level, "text_tr": text})
    return out


def summary_text(day: date, doc: dict[str, Any], risk: dict[str, Any] | None, pnl: dict[str, Any] | None) -> str:
    """Plain Turkish sentences from the brief's facts (no model, same input → same text)."""
    parts = [f"{date_tr(day)} sabah özeti."]
    n_pos, n_exp = len(doc["open_positions"]), len(doc["expiring_today"])
    parts.append(
        f"Açık pozisyon: {fmt_int(n_pos)}"
        + (f", bugün çıkış tarihi gelen: {fmt_int(n_exp)}." if n_exp else ", bugün çıkış tarihi gelen yok.")
    )
    parts.append(f"Açılışta gerçekleşecek emir: {fmt_int(len(doc['orders_for_open']))}.")
    parts.append(f"Onay bekleyen öneri: {fmt_int(len(doc['pending_approvals']))}.")
    if risk is not None:
        kill = "açık" if risk["kill_switch"] == "on" else "kapalı"
        regime = "kriz" if risk["regime"] == "crisis" else "normal"
        halt = ", günlük durdurma sürüyor" if risk["halted_today"] else ""
        parts.append(f"Risk: acil durdurma {kill}, rejim {regime}{halt}.")
    if pnl is not None:
        parts.append(
            f"Önceki seans ({date_tr(pnl['d'])}): getiri {fmt_signed_pct(float(pnl['daily_return']), 2)}, "
            f"özsermaye {fmt_try(float(pnl['equity']))}, zirveden düşüş {fmt_pct(float(pnl['drawdown']), 1)}."
        )
    else:
        parts.append("Önceki seans için gün sonu kâr/zarar kaydı yok.")
    n_res = len(doc["restriction_changes"])
    parts.append(f"Yeni kısıtlama değişikliği: {fmt_int(n_res)}." if n_res else "Yeni kısıtlama değişikliği yok.")
    parts.append(f"Son kapanıştan bu yana KAP bildirimi: {fmt_int(len(doc['important_disclosures']))}.")
    return " ".join(parts)


async def build_brief(
    conn: AsyncConnection[Any], day: date, now: datetime, *, live_marks: bool = False
) -> dict[str, Any]:
    """The MorningBrief of `day` as of `now` (validated; JSON-ready)."""
    since = last_close(day)
    since_day = since.astimezone(IST).date()
    disclosures = await _all(conn, DISCLOSURES_SQL, {"since": since, "now": now, "n": MAX_DISCLOSURES})
    orders = await _all(conn, ORDERS_SQL, {"now": now})
    cards = [c for c in await list_cards(conn, now=now, wall=now) if c["status"] == "pending"]
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
        "important_disclosures": [list_item(r) for r in disclosures],
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
