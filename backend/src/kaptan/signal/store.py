"""Signals from the database: one disclosure or a time window, read-only (nothing is fetched, no model is asked).

A disclosure is important exactly when the digest classifies it (`kaptan.digest.kinds.classify`): a KAP original
(not a correction), not noise, with a usable ticker and a known kind. `mine` is held (an open position or a
hand-entered holding) before watched. The line comes from the rules; for a thin one of mine, a stored model line
(`core.signal_line`) replaces it. `suggestion_tr` is KAPtan's word from the latest run for that disclosure.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Final, Literal

from kaptan.digest.kinds import classify
from kaptan.digest.store import HELD_SQL, KAP_URL, WATCH_SQL, ticker_of
from kaptan.reference._sql import fetch_all
from kaptan.signal.lines import Reading, Tone, fallback, read
from kaptan.text.turkish import IST

Mine = Literal["held", "watched"] | None
MAX_ROWS: Final = 1000
#: Backfilled rows (`ingest_source = 'backfill'`: the warm-up's last days and the evidence archive, 2022 → 2024) are
#: history, never news: older than this before `now` they never reach a window (unread, Telegram, morning message,
#: digest, brief, the model's signal lines), however wide the window is. Above the warm-up's 30-day maximum.
BACKFILL_NEWS_HORIZON: Final = timedelta(days=31)

COLUMNS: Final = """
d.disclosure_index, d.primary_ticker, d.stock_codes, d.company_name, d.subject, d.summary, d.subject_route,
d.is_noise, d.origin, d.reason, d.published_at, d.fin_year, d.fin_period,
jsonb_build_object(
  'status', d.parsed->>'status', 'direction', d.parsed->>'direction', 'mentions_fund', d.parsed->'mentions_fund',
  'latest', d.parsed->'latest', 'amounts', d.parsed->'amounts',
  'price_low_try', d.parsed->>'price_low_try', 'price_high_try', d.parsed->>'price_high_try') AS parsed
"""
ONE_SQL: Final = f"SELECT {COLUMNS} FROM core.disclosures d WHERE d.disclosure_index = %(index)s"  # noqa: S608
RANGE_SQL: Final = f"""
SELECT {COLUMNS} FROM core.disclosures d
 WHERE d.published_at >= %(since)s AND d.published_at < %(until)s
   AND (d.ingest_source <> 'backfill' OR d.published_at >= %(backfill_from)s)
   AND (NOT %(only)s OR (d.origin = 'kap' AND d.reason = 'NEW' AND NOT d.is_noise AND d.subject_route <> 'noise'))
 ORDER BY d.published_at DESC, d.disclosure_index DESC LIMIT {MAX_ROWS}
"""  # noqa: S608
LINES_SQL: Final = """
SELECT disclosure_index, line, tone, so_what FROM core.signal_line
 WHERE disclosure_index = ANY(%(ids)s) AND prompt_version = %(version)s
"""
REVENUE_SQL: Final = """
SELECT DISTINCT ON (ticker) ticker, value FROM core.fundamentals_pit
 WHERE ticker = ANY(%(tickers)s) AND item IN ('revenue_ttm', 'revenue_annual') AND currency = 'TRY'
   AND available_at <= %(now)s
 ORDER BY ticker, available_at DESC, item DESC
"""
RUN_SQL: Final = """
SELECT DISTINCT ON (r.disclosure_index) r.disclosure_index, r.outcome, r.status,
       tp.doc->>'side' AS side, a.status AS approval, a.expires_at
  FROM trading.agent_runs r
  LEFT JOIN trading.trade_proposals tp ON tp.run_id = r.run_id
  LEFT JOIN trading.approvals a ON a.proposal_id = tp.proposal_id
 WHERE r.disclosure_index = ANY(%(ids)s) AND r.visible AND NOT r.is_fixture
 ORDER BY r.disclosure_index, r.started_at DESC
"""


@dataclass(frozen=True, slots=True)
class Signal:
    disclosure_index: int
    ticker: str | None
    company: str
    published_at: datetime
    kind: str | None
    important: bool
    mine: Mine
    line_tr: str
    tone: Tone
    so_what_tr: str | None
    suggestion_tr: str | None
    kap_url: str
    panel_path: str


def panel_path(index: int, published_at: datetime) -> str:
    return f"/bildirimler?gun={published_at.astimezone(IST).date().isoformat()}&bildirim={index}"


def mine_of(row: dict[str, Any], held: set[str], watched: set[str]) -> Mine:
    codes = {c for c in [row.get("primary_ticker"), *(row.get("stock_codes") or [])] if c}
    if codes & held:
        return "held"
    return "watched" if codes & watched else None


def suggestion_of(run: dict[str, Any] | None, *, is_held: bool, now: datetime) -> str | None:
    """KAPtan's current word on a disclosure, from its latest run (None: no run, or nothing it can say)."""
    if run is None:
        return None
    outcome, approval, side = run.get("outcome"), run.get("approval"), str(run.get("side") or "").lower()
    if outcome == "PROPOSE":
        verb = "al" if side.startswith("b") else "sat" if side.startswith("s") else None
        if approval in ("pending", "claimed"):
            expires = run.get("expires_at")
            if expires is not None and expires <= now:
                return "KAPtan: önerinin süresi geçti"
            return f"KAPtan: {verb} önerisi hazır" if verb else "KAPtan: öneri hazır"
        if approval == "approved":
            return "KAPtan: önerini onayladın"
        if approval == "rejected":
            return "KAPtan: öneriyi reddettin"
        return "KAPtan: önerinin süresi geçti" if approval in ("expired", "cancelled") else None
    if outcome == "NO_TRADE":
        return "KAPtan: tut" if is_held else "KAPtan: işlem önermiyor"
    return None


def signal_of(
    row: dict[str, Any], held: set[str], watched: set[str], *, revenue: float | None,
    model: dict[str, Any] | None, run: dict[str, Any] | None, now: datetime,
) -> tuple[Signal, Reading]:  # fmt: skip
    """One Signal and the reading behind it (its `thin` flag says a model line would help). Pure."""
    index = int(row["disclosure_index"])
    mine = mine_of(row, held, watched)
    ticker = ticker_of(row)
    original = row.get("origin") == "kap" and row.get("reason") == "NEW"
    found = classify(row) if original and ticker is not None else None
    if found is None:
        reading = fallback(str(row["subject"] or ""))
        kind = None
    else:
        kind, base = found
        reading = read(row, kind, base, mine=mine, revenue_try=revenue)
        if reading.thin and mine is not None and model is not None:
            reading = Reading(str(model["line"]), model["tone"], model["so_what"], thin=False)
    signal = Signal(
        disclosure_index=index, ticker=ticker, company=str(row["company_name"] or ""),
        published_at=row["published_at"], kind=kind, important=found is not None, mine=mine,
        line_tr=reading.line, tone=reading.tone, so_what_tr=reading.so_what,
        suggestion_tr=suggestion_of(run, is_held=mine == "held", now=now) if found is not None else None,
        kap_url=KAP_URL.format(index), panel_path=panel_path(index, row["published_at"]),
    )  # fmt: skip
    return signal, reading


async def _tickers(conn: Any, sql: str) -> set[str]:
    return {str(r["ticker"]) for r in await fetch_all(conn, sql)}


async def assemble(conn: Any, rows: list[dict[str, Any]], now: datetime) -> list[tuple[Signal, Reading]]:
    from kaptan.signal.llm import cache_version  # the model step is optional; keep the import local

    if not rows:
        return []
    held, watched = await _tickers(conn, HELD_SQL), await _tickers(conn, WATCH_SQL)
    ids = [int(r["disclosure_index"]) for r in rows]
    lines = {
        int(r["disclosure_index"]): r
        for r in await fetch_all(conn, LINES_SQL, {"ids": ids, "version": cache_version()})
    }
    runs = {int(r["disclosure_index"]): r for r in await fetch_all(conn, RUN_SQL, {"ids": ids})}
    contract_tickers = sorted({str(t) for r in rows if r["subject_route"] == "E3" and (t := ticker_of(r))})
    revenue = (
        {
            str(r["ticker"]): float(r["value"])
            for r in await fetch_all(conn, REVENUE_SQL, {"tickers": contract_tickers, "now": now})
        }
        if contract_tickers
        else {}
    )
    out = []
    for row in rows:
        index = int(row["disclosure_index"])
        out.append(
            signal_of(
                row,
                held,
                watched,
                revenue=revenue.get(ticker_of(row) or ""),
                model=lines.get(index),
                run=runs.get(index),
                now=now,
            )
        )
    return out


async def describe(conn: Any, disclosure_index: int, now: datetime | None = None) -> Signal | None:
    """The Signal of one disclosure, or None when there is no such disclosure."""
    rows = await fetch_all(conn, ONE_SQL, {"index": disclosure_index})
    if not rows:
        return None
    return (await assemble(conn, [dict(rows[0])], now or datetime.now(IST)))[0][0]


def _range(since: datetime, until: datetime, now: datetime, *, only: bool) -> dict[str, Any]:
    return {"since": since, "until": until, "only": only, "backfill_from": now - BACKFILL_NEWS_HORIZON}


async def signals_between(
    conn: Any, since: datetime, until: datetime, *, only_important: bool = True, only_mine: bool = False,
    now: datetime | None = None,
) -> list[Signal]:  # fmt: skip
    """Signals published in [since, until), newest first. Mine first is the caller's choice (see `mine`)."""
    params = _range(since, until, now or until, only=only_important)
    rows = [dict(r) for r in await fetch_all(conn, RANGE_SQL, params)]
    pairs = await assemble(conn, rows, now or until)
    return [s for s, _ in pairs if (s.important or not only_important) and (s.mine is not None or not only_mine)]


async def thin_mine_ids(conn: Any, since: datetime, until: datetime) -> list[int]:
    """Important, mine, and the rules said little: the disclosures worth one model call (newest first)."""
    rows = [dict(r) for r in await fetch_all(conn, RANGE_SQL, _range(since, until, until, only=True))]
    return [s.disclosure_index for s, r in await assemble(conn, rows, until) if s.important and s.mine and r.thin]
