"""Personal-mode order tickets (emir fişi, 12 §2): the documents, ported from the panel mock.

`build_ticket()` = kaptan-panel/src/mocks/tickets.ts buildTicket(); `effective_entry()` =
effectiveEntry() (an unmarked ticket past valid_until reads `expired`); `ticket_order()` =
selectors.ts ticketOrder() (the ticket's own order, broker `order_ticket`, is derived, not stored).
Pure: dicts in, dicts out (JSON shapes of the zod schemas; times as toISOString() strings).
"""

from __future__ import annotations

import hashlib
import math
from datetime import datetime, timedelta
from typing import Any, Final

from kaptan.approvals.fmt_tr import fmt_dec, fmt_int, fmt_pct, fmt_price, ist_date, istanbul_at, istanbul_minutes
from kaptan.domain.schemas import iso_ms
from kaptan.portfolio.marks import js_round, next_trading_day

TICKET_TTL: Final = timedelta(minutes=30)
TICKET_CREATED_AFTER: Final = timedelta(seconds=20)  # the ticket is printed 20 s after the approval
PERSONAL_ACCOUNT_TRY: Final = 350_000
PAPER_EQUITY_TRY: Final = 1_016_480
CURRENT_STAGE: Final = "paper"
TICKET_SEQ_BASE: Final = 10
PASSING: Final = frozenset({"pass", "resize", "approval_required"})

EMPTY_ENTRY: Final[dict[str, Any]] = {
    "status": "awaiting",
    "filled_qty": None,
    "avg_price": None,
    "filled_at": None,
    "note": None,
    "marked_at": None,
}


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def ticket_valid_until(created: datetime) -> datetime:
    """30 minutes (R16); before 09:40 it runs from 09:40; after 18:00 from the next session's 09:40."""
    minutes = istanbul_minutes(created)
    day = ist_date(created)
    if minutes < 9 * 60 + 40:
        return istanbul_at(day, 9, 40) + TICKET_TTL
    if minutes >= 18 * 60:
        return istanbul_at(next_trading_day(day), 9, 40) + TICKET_TTL
    return min(created + TICKET_TTL, istanbul_at(day, 18, 0))


def ticket_number(created: datetime, seq: int) -> str:
    d = ist_date(created)
    return f"T-{d.year:04d}-{d.month:02d}{d.day:02d}-{seq:03d}"


def personal_qty(card: dict[str, Any]) -> int:
    """The approved notional scaled from the paper desk to the personal account, in whole lots."""
    approved = card["approved_notional_try"]
    notional: float = approved if approved is not None else card["final_notional_try"]
    scaled = (notional * PERSONAL_ACCOUNT_TRY) / PAPER_EQUITY_TRY
    limit: float = card["limit_price"]
    return max(1, math.floor(scaled / limit))


def _first(items: list[dict[str, Any]], pred: Any, default: str) -> str:
    for item in items:
        if pred(item):
            return str(item["detail_tr"])
    return default


def _edge_cost_lines(proposal: dict[str, Any] | None) -> tuple[str, str]:
    edge = proposal["expected_edge_bps"] / 100 / 100 if proposal else None
    cost = proposal["est_cost_bps"] / 100 / 100 if proposal else None
    ratio = edge / cost if edge is not None and cost else None
    cost_line = (
        f"Gidiş-dönüş maliyet {fmt_pct(cost, 2)} (komisyon + yarı-spread + etki + manuel kayma)"
        if cost is not None
        else "Maliyet: Neden ekranında"
    )
    edge_line = (
        f"Avantaj / maliyet = {fmt_pct(edge, 2)} / {fmt_pct(cost, 2)} = {fmt_dec(ratio, 1)}× (eşik 2,0)"
        if ratio is not None and edge is not None and cost is not None
        else "Avantaj / maliyet: Neden ekranında"
    )
    return cost_line, edge_line


def build_ticket(card: dict[str, Any], explain: dict[str, Any], *, seq: int, decided_at: str) -> dict[str, Any]:
    """buildTicket(card, explain, {seq, decidedAt, stage: CURRENT_STAGE}) — `entry` is EMPTY_ENTRY."""
    created = parse_iso(decided_at) + TICKET_CREATED_AFTER
    qty = personal_qty(card)
    p: dict[str, Any] | None = explain.get("proposal")
    checks: list[dict[str, Any]] = explain.get("risk_checks") or []
    trace: list[dict[str, Any]] = card["rule_trace_summary"]
    ticket_no = ticket_number(created, seq)
    digest = sha256_hex(f"ticket:{ticket_no}:{card['proposal_id']}")
    cost_line, edge_line = _edge_cost_lines(p)
    ev = card["evidence_summary"]
    amount_ok = any(c["rule_code"] == "R14" and c["outcome"] == "pass" for c in checks)
    return {
        "ticket_no": ticket_no,
        "order_id": f"ord-fis-{card['run_id'].removeprefix('run-')}",
        "proposal_id": card["proposal_id"],
        "run_id": card["run_id"],
        "rules_version": "rules-v1.0 / fwd",
        "approved_at": decided_at,
        "approval_deadline": card["expires_at"],
        "created_at": iso_ms(created),
        "valid_until": iso_ms(ticket_valid_until(created)),
        "mode_keys": {"config": False, "env": False, "ui": False},
        "side": "buy",
        "ticker": card["ticker"],
        "company_name": card["company_name"],
        "market": "Ana Pazar",
        "order_type": "limit",
        "session_tr": "AÇILIŞ SEANSI (09:40–09:55) · GÜNLÜK"
        if card["entry"] == "next_open_auction"
        else "SÜREKLİ İŞLEM (10:00–18:00) · GÜNLÜK",
        "qty": qty,
        "limit_price": card["limit_price"],
        "ref_price": p["ref_price"] if p else card["limit_price"],
        "upper_limit": js_round(card["limit_price"] * 1.1 * 100) / 100,
        "est_notional_try": js_round(qty * card["limit_price"]),
        "account_equity_try": PERSONAL_ACCOUNT_TRY,
        "event_line_tr": f"{card['event_type']} — {card['sub_type_tr']}",
        "kap_line_tr": f"idx {card['disclosure_index']} · {card['headline_tr']}",
        "materiality_line_tr": _first(trace, lambda r: r["passed"], "Kural izi: Neden ekranında"),
        "leakage_line_tr": _first(trace, lambda r: str(r["rule"]).startswith("LEAK"), "Sızıntı kontrolü geçti ✓"),
        "evidence_line_tr": (
            f"Benzer {fmt_int(ev['n'])} olay · medyan 5 günlük anormal getiri {fmt_pct(ev['median_car_5d'])}"
            f" · isabet {fmt_pct(ev['hit_rate_5d'], 0)} (örnek değer)"
        ),
        "cost_line_tr": cost_line,
        "edge_cost_line_tr": edge_line,
        "skeptic_line_tr": f"“{card['skeptic_note_tr']}”",
        "amount_check_line_tr": "Okuyucu tutarı metindeki regex tutarıyla eşleşti (R14) ✓"
        if amount_ok
        else "Tutar kontrolü (R14): uygulanmadı",
        # The mock prints "TL" twice ("80,89 TL TL"); kept for parity with the panel.
        "stop_line_tr": f"Kapanış bazlı stop {fmt_price(p['stop_price'])} TL" if p else "Stop: Neden ekranında",
        "planned_exit_tr": f"{card['holding_days'][0]}. seans kapanışı (en çok {card['holding_days'][1]} seans)",
        "gate_results": [{"code": c["rule_code"], "passed": c["outcome"] in PASSING} for c in checks],
        "approval_level": card["level"],
        "stage": CURRENT_STAGE,
        "audit_hash": digest,
        "prev_hash": sha256_hex(f"prev:{digest}"),
        "entry": dict(EMPTY_ENTRY),
        "is_fixture": card["is_fixture"],
    }


def effective_entry(valid_until: datetime, mark: dict[str, Any] | None, now: datetime) -> dict[str, Any]:
    """Your mark if any; otherwise `awaiting`, or `expired` once valid_until has passed (still markable)."""
    if mark is not None:
        return mark
    return {**EMPTY_ENTRY, "status": "expired"} if valid_until <= now else dict(EMPTY_ENTRY)


def ticket_order(ticket: dict[str, Any], decided_at: str | None) -> dict[str, Any]:
    """The ticket's own order: waits for your mark, then mirrors it (filled / canceled with a reason)."""
    created = iso_ms(parse_iso(decided_at) + TICKET_CREATED_AFTER) if decided_at else ticket["created_at"]
    entry = ticket["entry"]
    order: dict[str, Any] = {
        "id": ticket["order_id"],
        "client_order_id": f"fis-{ticket['ticket_no']}",
        "proposal_id": ticket["proposal_id"],
        "run_id": ticket["run_id"],
        "ticker": ticket["ticker"],
        "company_name": ticket["company_name"],
        "side": "buy",
        "order_type": "limit",
        "tif": "day",
        "qty": ticket["qty"],
        "limit_price": ticket["limit_price"],
        "status": "awaiting_manual_entry",
        "broker": "order_ticket",
        "created_at": created,
        "fills": [],
        "is_fixture": ticket["is_fixture"],
    }
    status = entry["status"]
    if status == "entered" and entry["filled_qty"] and entry["avg_price"] and entry["filled_at"]:
        fill = {
            "id": f"fill-{ticket['ticket_no']}",
            "order_id": ticket["order_id"],
            "qty": entry["filled_qty"],
            "price": entry["avg_price"],
            "commission": 0,
            "bsmv": 0,
            "slippage_bps": 0,
            "filled_at": entry["filled_at"],
            "source": "manual",
        }
        filled = "partially_filled" if entry["filled_qty"] < ticket["qty"] else "filled"
        return {**order, "status": filled, "fills": [fill]}
    reason = {"unfilled": "ticket_unfilled", "canceled": "ticket_canceled", "expired": "ticket_expired"}.get(status)
    if reason is not None:
        return {**order, "status": "canceled", "cancel_reason": reason}
    return order
