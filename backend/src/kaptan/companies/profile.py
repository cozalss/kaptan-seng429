"""The page of one company (`GET /companies/{ticker}`), assembled from what is stored: no call leaves the PC.

Nothing is invented: a company without prices has an empty price line, a company KAPtan has never looked at has
no decisions. "Followed" means inside KAPtan's universe (06 §2), with the failed rules said in plain words.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Final, Literal

from kaptan.companies.market import company_stats, index_line, insider_events
from kaptan.db import DictConn
from kaptan.disclosures.listing import LIST_ITEM_COLUMNS, to_item
from kaptan.reference._sql import fetch_all, fetch_one

Period = Literal["1m", "3m", "1y", "all"]
PERIOD_DAYS: Final[dict[str, int | None]] = {"1m": 31, "3m": 93, "1y": 366, "all": None}
MAX_POINTS: Final = 4000
DISCLOSURE_LIMIT: Final = 30
DECISION_LIMIT: Final = 20

IDENTITY_SQL: Final = """
SELECT coalesce(p.name, i.name) AS name, coalesce(p.sector, i.sector) AS sector, p.market
  FROM (SELECT %(t)s::text AS ticker) t
  LEFT JOIN core.issuer_profiles p ON p.ticker = t.ticker
  LEFT JOIN core.issuers i ON i.ticker = t.ticker
"""
NAME_FROM_DISCLOSURE_SQL: Final = """
SELECT company_name FROM core.disclosures WHERE primary_ticker = %s ORDER BY published_at DESC LIMIT 1
"""
UNIVERSE_SQL: Final = """
SELECT u.d, u.is_eligible, u.reasons, o.mode AS o_mode
  FROM core.universe_daily u LEFT JOIN core.universe_overrides o ON o.ticker = u.ticker
 WHERE u.ticker = %s AND u.d <= %s ORDER BY u.d DESC LIMIT 1
"""
PRICES_SQL: Final = """
SELECT DISTINCT ON (d) d, close FROM core.prices_daily
 WHERE ticker = ANY(core.ticker_codes(%(t)s)) AND source = 'isyatirim' AND price_basis = 'raw'
   AND (%(since)s::date IS NULL OR d >= %(since)s)
 ORDER BY d, ticker <> %(t)s
"""
POSITIONS_SQL: Final = """
SELECT sum(qty)::int AS qty, sum(qty * avg_cost) / nullif(sum(qty), 0) AS avg_cost, min(opened_at) AS since
  FROM trading.positions WHERE ticker = %s
"""
DISCLOSURES_SQL: Final = f"""
SELECT {LIST_ITEM_COLUMNS} FROM core.disclosures
 WHERE primary_ticker = %(t)s OR %(t)s = ANY(stock_codes)
 ORDER BY published_at DESC, disclosure_index DESC LIMIT %(limit)s
"""  # noqa: S608
DECISIONS_SQL: Final = """
SELECT r.run_id, r.disclosure_index, r.kind, r.event_type, r.started_at, tp.proposal_id,
       CASE WHEN a.status = 'pending' AND a.expires_at < %(now)s THEN 'expired' ELSE a.status END AS approval_status,
       a.card->>'side' AS side
  FROM trading.agent_runs r
  LEFT JOIN trading.trade_proposals tp ON tp.run_id = r.run_id
  LEFT JOIN trading.approvals a ON a.proposal_id = tp.proposal_id
 WHERE r.ticker = %(t)s AND r.visible AND r.kind <> 'archived'
 ORDER BY r.started_at DESC LIMIT %(limit)s
"""

KIND_DECISION: Final = {
    "propose": "suggested",
    "hold": "held",
    "no_trade": "no_trade",
    "quarantine": "vetoed",
    "pregate_veto": "vetoed",
}
DECISION_WHY_TR: Final = {
    "held": "Elinde tutmanı önerdim.",
    "no_trade": "Yakından baktım; almak ya da satmak için yeterli sebep bulamadım.",
    "vetoed": "Riskli ya da belirsiz bulduğum için bu haberde işlem önermedim.",
}
SIDE_WORD: Final = {"sell": "Satmanı", "buy": "Almanı"}
APPROVAL_TAIL: Final = {
    "approved": "önerdim, onayladın.",
    "rejected": "önerdim, reddettin.",
    "expired": "önerdim; süresi doldu.",
    "cancelled": "önerdim; öneri iptal oldu.",
    "claimed": "önerdim; işlem sürüyor.",
}
#: The universe rules (06 §2) a company can fail, in the words of a person.
RULE_WORDS_TR: Final = {
    "U1": "Hisse, KAPtan'ın baktığı pazarlarda işlem görmüyor.",
    "U2": "Günlük işlem hacmi çok düşük; istediğin kadarını rahat alıp satamazsın.",
    "U3": "Halka açık pay oranı çok düşük.",
    "U4": "Halka açık payların toplam değeri çok küçük.",
    "U5": "Fiyat geçmişi henüz yeterince uzun değil.",
    "U6": "Fiyat verisinde güvenemediğim boşluklar var.",
    "U7": "Yakın zamanda borsa bu hisseye bir tedbir koymuş.",
    "U8": "Bu bir şirket hissesi değil.",
}


def following_sentence(is_eligible: bool | None, mode: str | None, reasons: list[str]) -> dict[str, Any]:
    """Whether KAPtan follows the company, in plain words. Pure. `known` is false when no universe row exists."""
    if mode == "exclude":
        return {"in_universe": False, "known": True, "reasons_tr": ["Sen bu şirketi dışarıda bıraktın."]}
    if mode == "include":
        return {"in_universe": True, "known": True, "reasons_tr": []}
    if is_eligible is None:
        return {"in_universe": False, "known": False, "reasons_tr": []}
    words = [RULE_WORDS_TR[r] for r in reasons if r in RULE_WORDS_TR]
    return {"in_universe": bool(is_eligible), "known": True, "reasons_tr": [] if is_eligible else words}


def decision_of(row: dict[str, Any]) -> dict[str, Any] | None:
    """One KAPtan run on this company as a plain decision. Pure."""
    kind = KIND_DECISION.get(row["kind"])
    if kind is None:
        return None
    if kind == "suggested":
        verb = SIDE_WORD.get(row["side"] or "buy", "Almanı")
        tail = APPROVAL_TAIL.get(row["approval_status"] or "", "öneriyorum. Karar senin.")
        why = f"{verb} {tail}"
    else:
        why = DECISION_WHY_TR[kind]
    return {
        "run_id": row["run_id"],
        "disclosure_index": row["disclosure_index"],
        "decision": kind,
        "event_type": row["event_type"],
        "why_tr": why,
        "at": row["started_at"],
        "proposal_id": row["proposal_id"],
        "approval_status": row["approval_status"],
        "side": row["side"],
    }


def position_view(row: dict[str, Any] | None, last: Decimal | None) -> dict[str, Any] | None:
    """What the person owns of it, with the gain at the last close; None when nothing is held. Pure."""
    if row is None or not row["qty"]:
        return None
    qty, cost = int(row["qty"]), float(row["avg_cost"])
    last_f = None if last is None else float(last)
    return {
        "qty": qty,
        "avg_cost": round(cost, 4),
        "last_price": last_f,
        "gain_try": None if last_f is None else round((last_f - cost) * qty, 2),
        "gain_pct": None if last_f is None else round((last_f / cost - 1) * 100, 2),
        "since": row["since"],
    }


async def company_name(conn: DictConn, ticker: str, identity: dict[str, Any] | None) -> str | None:
    if identity and identity["name"]:
        return str(identity["name"])
    row = await fetch_one(conn, NAME_FROM_DISCLOSURE_SQL, (ticker,))
    return None if row is None else str(row["company_name"])


async def company_profile(
    conn: DictConn, ticker: str, *, now: datetime, period: Period = "3m"
) -> dict[str, Any] | None:
    """The whole page, or None when this code is unknown (no profile, no issuer, no disclosure)."""
    identity = await fetch_one(conn, IDENTITY_SQL, {"t": ticker})
    name = await company_name(conn, ticker, identity)
    if name is None:
        return None
    today = now.date()
    days = PERIOD_DAYS[period]
    since: date | None = None if days is None else today - timedelta(days=days)
    bars = (await fetch_all(conn, PRICES_SQL, {"t": ticker, "since": since}))[-MAX_POINTS:]
    uni = await fetch_one(conn, UNIVERSE_SQL, (ticker, today))
    last_close = bars[-1]["close"] if bars else None
    prev = bars[-2]["close"] if len(bars) > 1 else None
    held = await fetch_one(conn, POSITIONS_SQL, (ticker,))
    disclosures = await fetch_all(conn, DISCLOSURES_SQL, {"t": ticker, "limit": DISCLOSURE_LIMIT})
    runs = await fetch_all(conn, DECISIONS_SQL, {"t": ticker, "now": now, "limit": DECISION_LIMIT})
    watched = await fetch_one(conn, "SELECT 1 AS ok FROM core.watchlist WHERE ticker = %s", (ticker,))
    return {
        "ticker": ticker,
        "name": name,
        "sector": (identity or {}).get("sector") or None,
        "market": (identity or {}).get("market"),
        "following": following_sentence(
            None if uni is None else bool(uni["is_eligible"]),
            None if uni is None else uni["o_mode"],
            [] if uni is None else list(uni["reasons"] or []),
        ),
        "watched": watched is not None,
        "price": {
            "period": period,
            "points": [{"d": b["d"], "close": float(b["close"])} for b in bars],
            "last_close": None if last_close is None else float(last_close),
            "last_day": bars[-1]["d"] if bars else None,
            "change_pct": None
            if last_close is None or not prev
            else round((float(last_close) / float(prev) - 1) * 100, 2),
        },
        "stats": await company_stats(conn, ticker, today),
        "benchmark": await index_line(conn, since) if bars else None,
        "insiders": await insider_events(conn, ticker),
        "position": position_view(held, last_close),
        "disclosures": [to_item(dict(r)) for r in disclosures],
        "decisions": [d for d in (decision_of(r) for r in runs) if d is not None],
    }
