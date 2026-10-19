"""`GET /personal/stage` (PersonalStageStatus, 12 §1): which personal-money stage we are in and its go criteria.

The stage follows the calendar of 12 §1 / 08 §4.1 (Kanıt until the forward start on 9 Nov 2026, then Paper);
moving to Gölge or Küçük gerçek para is a person's written decision, never automatic, so the computed stage
stops at Paper. The criteria are measured: holdout (core.event_returns, 20-day CAR per type, t and n),
closed trades and days in paper, max drawdown of the live strategy (trading.pnl_daily).
"""

from __future__ import annotations

import math
from datetime import date, datetime
from typing import Any, Final

from kaptan.db import DictConn
from kaptan.portfolio.pnl import LIVE_STRATEGY
from kaptan.reference._sql import fetch_all, fetch_one

PAPER_START: Final = date(2026, 11, 9)
EVIDENCE_START: Final = date(2026, 10, 1)
MIN_TRADES: Final = 50
MIN_PAPER_DAYS: Final = 90
MAX_PAPER_DD: Final = 0.10
HOLDOUT_T: Final = 2.0
HOLDOUT_N: Final = 30

STAGES: Final = (
    ("evidence", 0, "Kanıt", "Eki–Kas 2026", "Geçmiş olaylarda kural bir kez, ayrılmış dönemde sınanır."),
    ("paper", 1, "Paper", "9 Kas 2026 → en az 3 ay", "Dondurulmuş kurallarla SimBIST'te işlem; para yok."),
    ("shadow", 2, "Gölge", "Paper'dan sonra, en az 4 hafta", "Gerçek emir fişi üretilir, gerçek para kullanılmaz."),
    ("small_real", 3, "Küçük gerçek para", "Nisan–Haziran 2027", "Ayrı hesapta küçük tutar, fişle elle giriş."),
)
TICKET_MODE_TR: Final = {
    "evidence": "Onaylanan öneri yalnızca kayda geçer; emir fişi üretilmez.",
    "paper": "Onaylanan öneri SimBIST'te dolar; emir fişi yalnızca bilgi içindir.",
    "shadow": "Emir fişi üretilir; gerçek para kullanılmaz, fiyatı not edersin.",
    "small_real": "Emir fişini aracı kurum uygulamasına sen girersin.",
}

HOLDOUT_SQL: Final = """
SELECT e.event_code, count(*)::int AS n, avg(r.car)::float8 AS mean, stddev_samp(r.car)::float8 AS sd
  FROM core.event_returns r JOIN core.events e USING (event_id)
 WHERE r.horizon = 20 AND r.model = 'market_adj' AND e.event_code IN ('E1', 'E2', 'E3', 'E4')
   AND e.event_time >= timestamptz '2025-01-01 00:00:00+03' AND e.event_time < timestamptz '2026-11-01 00:00:00+03'
   AND r.available_at < %s
 GROUP BY e.event_code ORDER BY e.event_code
"""
CLOSED_SQL: Final = "SELECT count(*)::int AS n FROM trading.closed_positions WHERE book = 'paper' AND closed_at < %s"
DD_SQL: Final = "SELECT min(drawdown)::float8 AS dd FROM trading.pnl_daily WHERE strategy = %s AND d <= %s"


def pct_tr(x: float, digits: int = 1) -> str:
    """'%−3,1' (Turkish percent sign first, decimal comma, real minus sign)."""
    body = f"{abs(x) * 100:.{digits}f}".replace(".", ",")
    return f"%{'−' if x < 0 else ''}{body}"


def t_stat(mean: float | None, sd: float | None, n: int) -> float:
    if mean is None or not sd or n < 2 or math.isnan(sd):
        return 0.0
    return mean / (sd / math.sqrt(n))


def current_stage(today: date) -> str:
    return "evidence" if today < PAPER_START else "paper"


def _criterion(
    cid: str, label: str, cur: str, target: str, progress: float | None, met: bool, source: str
) -> dict[str, Any]:
    p = None if progress is None else max(0.0, min(1.0, progress))
    return {
        "id": cid,
        "label_tr": label,
        "current_tr": cur,
        "target_tr": target,
        "progress": p,
        "met": met,
        "source": source,
    }


def evidence_criteria(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    best = max(rows, key=lambda r: t_stat(r["mean"], r["sd"], r["n"]), default=None)
    if best is None:
        return [
            _criterion(
                "holdout",
                "Ayrılmış dönemde en az bir olay tipi geçer",
                "Henüz ölçülmedi",
                f"t ≥ 2,0 · n ≥ {HOLDOUT_N} · ortalama > 0",
                0.0,
                False,
                "kanonik",
            )
        ]
    t, n, mean = t_stat(best["mean"], best["sd"], best["n"]), int(best["n"]), float(best["mean"] or 0.0)
    met = t >= HOLDOUT_T and n >= HOLDOUT_N and mean > 0
    cur = f"{best['event_code']}: t = {t:.2f}".replace(".", ",") + f" · n = {n} · ort. {pct_tr(mean, 2)}"
    return [
        _criterion(
            "holdout",
            "Ayrılmış dönemde en az bir olay tipi geçer",
            cur,
            f"t ≥ 2,0 · n ≥ {HOLDOUT_N} · ortalama > 0",
            min(t / HOLDOUT_T, n / HOLDOUT_N, 1.0) if mean > 0 else 0.0,
            met,
            "kanonik",
        )
    ]


def paper_criteria(trades: int, days: int, dd: float) -> list[dict[str, Any]]:
    return [
        _criterion(
            "closed_trades",
            "Kapanmış işlem",
            f"{trades} / {MIN_TRADES} işlem",
            f"en az {MIN_TRADES} işlem",
            trades / MIN_TRADES,
            trades >= MIN_TRADES,
            "kanonik",
        ),
        _criterion(
            "paper_days",
            "Paper süresi",
            f"{days} / {MIN_PAPER_DAYS} gün",
            "en az 3 ay",
            days / MIN_PAPER_DAYS,
            days >= MIN_PAPER_DAYS,
            "kanonik",
        ),
        _criterion(
            "max_dd",
            "En büyük düşüş",
            pct_tr(dd),
            f"en fazla {pct_tr(-MAX_PAPER_DD, 0)}",
            None,
            dd >= -MAX_PAPER_DD,
            "kisisel",
        ),
    ]


async def personal_stage(conn: DictConn, *, now: datetime, today: date, is_sample: bool) -> dict[str, Any]:
    current = current_stage(today)
    order = [s[0] for s in STAGES]
    idx = order.index(current)
    stages = [
        {
            "id": sid,
            "n": n,
            "label_tr": label,
            "window_tr": window,
            "summary_tr": summary,
            "status": "done" if i < idx else "current" if i == idx else "next" if i == idx + 1 else "locked",
        }
        for i, (sid, n, label, window, summary) in enumerate(STAGES)
    ]
    if current == "evidence":
        criteria = evidence_criteria(await fetch_all(conn, HOLDOUT_SQL, (now,)))
        started = EVIDENCE_START
    else:
        closed = await fetch_one(conn, CLOSED_SQL, (now,)) or {}
        dd_row = await fetch_one(conn, DD_SQL, (LIVE_STRATEGY, today)) or {}
        days = max(0, (today - PAPER_START).days)
        criteria = paper_criteria(int(closed.get("n") or 0), days, float(dd_row.get("dd") or 0.0))
        started = PAPER_START
    return {
        "current": current,
        "started_on": started,
        "stages": stages,
        "criteria": criteria,
        "ticket_mode_tr": TICKET_MODE_TR[current],
        "as_of": now,
        "is_sample": is_sample,
    }
