"""`GET /personal/stage` (PersonalStageStatus, 12 §1): which personal-money stage we are in and its go criteria.

The stage follows the calendar of 12 §1 / 08 §4.1 (Kanıt until the forward start on 9 Nov 2026, then Paper);
moving to Gölge or Küçük gerçek para is a person's written decision, never automatic, so the computed stage
stops at Paper. The criteria are measured: the holdout's one recorded run (core.holdout_runs; this module never
computes it, 12 §1 "yalnızca bir kez", `kaptan.evalreports.holdout` is the only reader of that period's returns),
closed trades and days in paper, max drawdown of the live strategy (trading.pnl_daily).
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from datetime import date, datetime
from typing import Any, Final

from kaptan.db import DictConn
from kaptan.evalreports.holdout import main_report
from kaptan.portfolio.pnl import LIVE_STRATEGY
from kaptan.reference._sql import fetch_one

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
    ("shadow", 2, "Gölge", "Paper'dan sonra, en az 4 hafta", "Gerçek işlem bilgisi çıkar, gerçek para kullanılmaz."),
    ("small_real", 3, "Küçük gerçek para", "Nisan–Haziran 2027", "Ayrı hesapta küçük tutar, işlemi sen girersin."),
)
TICKET_MODE_TR: Final = {
    "evidence": "Onaylanan öneri yalnızca kayda geçer; işlem bilgisi çıkmaz.",
    "paper": "Onaylanan öneri deneme hesabında gerçekleşir; işlem bilgisi yalnızca bilgi içindir.",
    "shadow": "İşlem bilgisi çıkar; gerçek para kullanılmaz, fiyatı not edersin.",
    "small_real": "İşlem bilgisini banka ya da aracı kurum uygulamana sen girersin.",
}

CLOSED_SQL: Final = "SELECT count(*)::int AS n FROM trading.closed_positions WHERE book = 'paper' AND closed_at < %s"
DD_SQL: Final = "SELECT min(drawdown)::float8 AS dd FROM trading.pnl_daily WHERE strategy = %s AND d <= %s"


def pct_tr(x: float, digits: int = 1) -> str:
    """'%−3,1' (Turkish percent sign first, decimal comma, real minus sign)."""
    body = f"{abs(x) * 100:.{digits}f}".replace(".", ",")
    return f"%{'−' if x < 0 else ''}{body}"


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


def evidence_criteria(report: Mapping[str, Any] | None) -> list[dict[str, Any]]:
    """The one criterion from the stored run: unmeasured until it ran; the first passing type, else the closest."""
    target = f"t ≥ 2,0 · n ≥ {HOLDOUT_N} · ortalama > 0"
    label = "Ayrılmış dönemde en az bir olay tipi geçer"
    types = (report or {}).get("types") or {}
    if not types:
        return [_criterion("holdout", label, "Henüz ölçülmedi", target, 0.0, False, "kanonik")]
    best_code = max(
        types,
        key=lambda c: (bool(types[c]["base"]["passed"]), types[c]["base"]["t_bmp_kp"] or -math.inf, types[c]["n"]),
    )
    best = types[best_code]["base"]
    t, n, mean = float(best["t_bmp_kp"] or 0.0), int(types[best_code]["n"]), float(best["mean_car_net"] or 0.0)
    cur = f"{best_code}: t = {t:.2f}".replace(".", ",") + f" · n = {n} · ort. {pct_tr(mean, 2)}"
    progress = min(t / HOLDOUT_T, n / HOLDOUT_N, 1.0) if mean > 0 else 0.0
    return [_criterion("holdout", label, cur, target, progress, bool(best["passed"]), "kanonik")]


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


async def personal_stage(conn: DictConn, *, now: datetime, today: date) -> dict[str, Any]:
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
    holdout = evidence_criteria(await main_report(conn))
    if current == "evidence":
        criteria = holdout
        started = EVIDENCE_START
    else:
        closed = await fetch_one(conn, CLOSED_SQL, (now,)) or {}
        dd_row = await fetch_one(conn, DD_SQL, (LIVE_STRATEGY, today)) or {}
        days = max(0, (today - PAPER_START).days)
        criteria = [*holdout, *paper_criteria(int(closed.get("n") or 0), days, float(dd_row.get("dd") or 0.0))]
        started = PAPER_START
    return {
        "current": current,
        "started_on": started,
        "stages": stages,
        "criteria": criteria,
        "ticket_mode_tr": TICKET_MODE_TR[current],
        "as_of": now,
        "is_sample": False,
    }
