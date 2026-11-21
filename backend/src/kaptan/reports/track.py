"""The track record: every suggestion KAPtan made, what the person did with it, and what the price did after.

    items = await track_items(conn, now)             # one TrackItem per buy suggestion, oldest first
    summary = summarize(items)                       # counts, averages, best, worst, plain sentences

What happened after a suggestion is the plan's own period, measured the way the shadow returns are
(`kaptan.portfolio.shadow`): the adjusted price from the opening of the first session after the suggestion to the
close of the last day of the card's planned holding period (`holding_days` upper end), and BIST 100 over the same
sessions. It is the move of the share, the same for a suggestion you took and one you skipped; commission is not in
it. A suggestion whose period is not over yet has no result: it says when it will ("sonuç 6 Aralık'ta belli olur").
A finished period without stored prices says so and is left out of every average; nothing is estimated.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.domain.schemas._base import iso_ms
from kaptan.portfolio.shadow import BENCHMARK, auction_day
from kaptan.prices.calendar import CalendarRangeError, add_sessions, close_known_at
from kaptan.prices.reads import forward_return
from kaptan.reports.words import FLAT, day_locative, day_tr, signed
from kaptan.rules.format import fmt_int

#: Fewer finished results than this and the average says almost nothing.
ENOUGH_RESULTS: Final = 30
DEFAULT_HI: Final = 5

APPROVALS_SQL: Final = """
SELECT a.proposal_id, a.status, a.created_at, a.expires_at, a.card, r.ticker, r.company_name,
       (SELECT t.entry_status FROM trading.order_tickets t WHERE t.proposal_id = a.proposal_id
         ORDER BY t.created_at DESC LIMIT 1) AS ticket_status
  FROM trading.approvals a JOIN trading.agent_runs r ON r.run_id = a.run_id
 WHERE r.visible AND a.run_id NOT LIKE 'run-hist%%' AND coalesce(a.card->>'side', 'buy') = 'buy'
   AND (%(lo)s::timestamptz IS NULL OR a.created_at >= %(lo)s)
   AND (%(hi)s::timestamptz IS NULL OR a.created_at < %(hi)s)
 ORDER BY a.created_at, a.proposal_id
"""
SKIPPED_SQL: Final = """
SELECT DISTINCT entity_id FROM audit.audit_log
 WHERE action IN ('suggestion.held', 'suggestion.skipped') AND entity_id = ANY(%s::text[])
"""

DECISION_TR: Final = {
    "took": "Aldın",
    "approved_open": "Onayladın; bankada almanı bekliyor",
    "not_bought": "Onayladın ama almadın",
    "declined": "Reddettin",
    "skipped": "Geçtin",
    "expired": "Süresi doldu, karar vermedin",
    "waiting": "Kararını bekliyor",
    "cancelled": "Öneri iptal oldu",
}
#: Decisions the person made themselves.
DECIDED: Final = frozenset({"took", "approved_open", "not_bought", "declined", "skipped"})


@dataclass(frozen=True, slots=True)
class Outcome:
    entry_day: date
    result_day: date | None
    sessions: int
    status: str  # done | open | no_data
    ret: float | None = None
    index: float | None = None


def decision_of(status: str, ticket: str | None, skipped: bool, expires_at: datetime, now: datetime) -> str:
    """What the person did with a suggestion, from the card, its order ticket and a "Tut"/"Geç" in the history."""
    if status == "approved":
        if ticket == "entered":
            return "took"
        return "approved_open" if ticket in (None, "awaiting") else "not_bought"
    if status == "rejected":
        return "declined"
    if status == "cancelled":
        return "cancelled"
    if skipped:
        return "skipped"
    if status == "expired" or (status == "pending" and expires_at <= now):
        return "expired"
    return "waiting"


async def outcome_of(conn: AsyncConnection[Any], ticker: str, created_at: datetime, hi: int, now: datetime) -> Outcome:
    """The planned period of a suggestion made at `created_at` and, once over, the share's and BIST 100's move."""
    entry = auction_day(created_at)
    sessions = hi + 1
    try:
        last = add_sessions(entry, sessions - 1)
        over = now >= close_known_at(last)
    except CalendarRangeError:
        return Outcome(entry, None, sessions, "open")
    if not over:
        return Outcome(entry, last, sessions, "open")
    ret = await forward_return(conn, ticker, entry, sessions, entry="open")
    if ret is None:
        return Outcome(entry, last, sessions, "no_data")
    index = await forward_return(conn, BENCHMARK, entry, sessions, entry="open")
    return Outcome(entry, last, sessions, "done", float(ret), None if index is None else float(index))


def result_text(o: Outcome) -> str:
    if o.status == "done" and o.ret is not None:
        text = (
            f"{day_tr(o.entry_day)} – {day_tr(o.result_day)} arasında {signed(o.ret)}"
            if o.result_day
            else signed(o.ret)
        )
        return text if o.index is None else f"{text} (aynı günlerde BIST 100 {signed(o.index)})"
    if o.status == "no_data":
        return "Bu günler için fiyat kaydı bulunamadı; sonuç hesaplanamadı."
    return f"Sonuç {day_locative(o.result_day)} belli olur" if o.result_day else "Sonuç henüz belli değil"


async def track_items(
    conn: AsyncConnection[Any], now: datetime, *, lo: datetime | None = None, hi: datetime | None = None
) -> list[dict[str, Any]]:
    """TrackItem documents for the buy suggestions created in [lo, hi) (all when None), oldest first."""
    async with conn.cursor() as cur:
        await cur.execute(APPROVALS_SQL, {"lo": lo, "hi": hi})
        rows = list(await cur.fetchall())
        ids = [r["proposal_id"] for r in rows]
        await cur.execute(SKIPPED_SQL, (ids,))
        skipped = {r["entity_id"] for r in await cur.fetchall()}
    out: list[dict[str, Any]] = []
    for r in rows:
        decision = decision_of(r["status"], r["ticket_status"], r["proposal_id"] in skipped, r["expires_at"], now)
        planned = r["card"].get("holding_days") or [1, DEFAULT_HI]
        o = await outcome_of(conn, r["ticker"], r["created_at"], int(planned[1]), now)
        out.append(
            {
                "proposal_id": r["proposal_id"],
                "ticker": r["ticker"],
                "company_name": r["company_name"],
                "suggested_at": iso_ms(r["created_at"]),
                "decision": decision,
                "decision_tr": DECISION_TR[decision],
                "entry_day": o.entry_day.isoformat(),
                "result_day": None if o.result_day is None else o.result_day.isoformat(),
                "planned_sessions": o.sessions,
                "status": o.status,
                "return_ratio": o.ret,
                "index_ratio": o.index,
                "result_tr": result_text(o),
            }
        )
    return out


def _avg(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _group(items: list[dict[str, Any]]) -> dict[str, Any]:
    ratios = [i["return_ratio"] for i in items]
    return {"n": len(items), "avg_ratio": _avg(ratios)}


def _pick(item: dict[str, Any] | None) -> dict[str, Any] | None:
    if item is None:
        return None
    return {"ticker": item["ticker"], "company_name": item["company_name"], "ratio": item["return_ratio"]}


def _headline(count: int, done: int, up: int, down: int, avg: float | None) -> str:
    if count == 0:
        return "KAPtan henüz sana öneri vermedi."
    if done == 0 or avg is None:
        return f"KAPtan {fmt_int(count)} öneri verdi; hiçbirinin süresi henüz dolmadı."
    flat = done - up - down
    parts = [f"{fmt_int(up)} arttı", f"{fmt_int(down)} azaldı"] + ([f"{fmt_int(flat)} değişmedi"] if flat else [])
    return f"Süresi dolan {fmt_int(done)} öneriden {', '.join(parts)}. Ortalama sonuç {signed(avg)}."


def _caveat(done: int) -> str | None:
    if done == 0:
        return None
    small = (
        f"Henüz {fmt_int(done)} öneri sonuçlandı; bu kadar azla bir şey söylemek erken. "
        if done < ENOUGH_RESULTS
        else ""
    )
    return f"{small}Hesapta komisyon yok; her öneriye aynı tutar verilmiş gibi ortalama alındı."


def _compare(all_: dict[str, Any], took: dict[str, Any], skipped: dict[str, Any]) -> str | None:
    if all_["n"] == 0 or all_["avg_ratio"] is None:
        return None
    if took["n"] == 0:
        return "Henüz hiçbir öneriyi almadın; bu yüzden senin yaptığınla karşılaştırılacak bir şey yok."
    text = (
        f"Her öneriyi izleseydin ortalama {signed(all_['avg_ratio'])} olurdu; senin aldığın "
        f"{fmt_int(took['n'])} öneri ortalama {signed(took['avg_ratio'])} oldu."
    )
    if skipped["n"]:
        text += f" Almadığın {fmt_int(skipped['n'])} öneri ortalama {signed(skipped['avg_ratio'])} oldu."
    return text


def summarize(items: list[dict[str, Any]]) -> dict[str, Any]:
    """TrackSummary of TrackItem documents: counts, averages, best and worst, the plain sentences."""
    done = [i for i in items if i["status"] == "done" and i["return_ratio"] is not None]
    ratios = [i["return_ratio"] for i in done]
    up = sum(1 for r in ratios if r >= FLAT)
    down = sum(1 for r in ratios if r <= -FLAT)
    avg = _avg(ratios)
    took = [i for i in done if i["decision"] == "took"]
    skipped = [i for i in done if i["decision"] in ("skipped", "declined", "expired", "not_bought")]
    all_g, took_g, skip_g = _group(done), _group(took), _group(skipped)
    with_index = [i for i in done if i["index_ratio"] is not None]
    return {
        "count": len(items),
        "done": len(done),
        "open": sum(1 for i in items if i["status"] == "open"),
        "no_data": sum(1 for i in items if i["status"] == "no_data"),
        "up": up,
        "down": down,
        "flat": len(done) - up - down,
        "avg_ratio": avg,
        "index_avg_ratio": _avg([i["index_ratio"] for i in with_index]),
        "best": _pick(max(done, key=lambda i: i["return_ratio"], default=None)),
        "worst": _pick(min(done, key=lambda i: i["return_ratio"], default=None)),
        "followed_all": all_g,
        "you_took": took_g,
        "you_skipped": skip_g,
        "headline_tr": _headline(len(items), len(done), up, down, avg),
        "caveat_tr": _caveat(len(done)),
        "compare_tr": _compare(all_g, took_g, skip_g),
    }
