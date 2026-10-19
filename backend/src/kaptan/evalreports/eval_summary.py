"""`GET /eval/summary` (EvalSummary, kaptan-panel/src/lib/domain/reports.ts) from the desk's tables.

Filled from data: L4 (pnl_daily series, closed trades), the shadow returns (trading.shadow_signals with a
20-day return), latency (p50/p95 of finished live agent runs) and today's LLM cost (core.day_counters).
L1 (gold test set), L2 (RAGAS), L3 (holdout, run once), ablations and the red-team set are offline
evaluations with no table yet: they stay empty (zeros, no rows) until those runs write their results.
`is_sample` follows DEMO_MODE (the demo day's series is the seed's, labelled as such).
"""

from __future__ import annotations

import math
from datetime import date, datetime
from typing import Any, Final

from kaptan.db import DictConn
from kaptan.domain.schemas.reports import SAMPLE_LABEL
from kaptan.portfolio.pnl import list_pnl
from kaptan.reference._sql import fetch_all, fetch_one

REAL_LABEL: Final = "ileri dönük paper · kendi kayıtlarımızdan ölçüldü"
V1_0_START: Final = date(2026, 11, 9)
V1_1_START: Final = date(2026, 11, 23)

SHADOW_SQL: Final = """
SELECT coalesce(proposal_id, signal_id) AS proposal_id, ticker, reason_source || ':' || reason_code AS rejected_by,
       return_20d
  FROM trading.shadow_signals
 WHERE return_20d IS NOT NULL
 ORDER BY decided_at DESC, signal_id
 LIMIT 200
"""
CLOSED_SQL: Final = "SELECT count(*)::int AS n FROM trading.closed_positions"
LATENCY_SQL: Final = """
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95
  FROM trading.agent_runs
 WHERE run_set = 'live' AND finished_at IS NOT NULL AND latency_ms > 0
"""
COST_SQL: Final = "SELECT llm_calls, llm_tokens FROM core.day_counters WHERE d = %s"
DECISIONS_SQL: Final = "SELECT count(*)::int AS n FROM trading.agent_runs WHERE run_set = 'live' AND llm_calls > 0"


def _seconds(ms: Any) -> float:
    return 0.0 if ms is None or (isinstance(ms, float) and math.isnan(ms)) else round(float(ms) / 1000.0, 3)


def empty_layers() -> dict[str, Any]:
    """L1/L2/L3, ablations and red-team with no rows: the shapes zod expects, no invented values."""
    return {
        "l1": {
            "split": "gold_test_200",
            "macro_f1": 0.0,
            "target_macro_f1": 0.85,
            "per_class": [],
            "confusion": [],
            "kappa": 0.0,
            "ece": 0.0,
            "models": [],
        },
        "l2": {
            "questions": 50,
            "faithfulness": 0.0,
            "context_precision": 0.0,
            "context_recall": 0.0,
            "recall_at_10": 0.0,
            "mrr": 0.0,
            "time_violations": 0,
            "stores": [],
            "trend": [],
        },
        "l3": {"window": "2025-01-01 → 2026-10-31", "run_once": True, "rows": []},
        "ablations": [],
        "redteam": {
            "malicious": 0,
            "benign": 0,
            "orders_from_malicious": 0,
            "block_rate": 0.0,
            "false_alarm_rate": 0.0,
            "by_code": {"Q": 0, "N": 0, "H": 0, "F": 0},
        },
    }


async def eval_summary(conn: DictConn, *, now: datetime, today: date, is_sample: bool) -> dict[str, Any]:
    series = await list_pnl(conn, None, None)
    shadow = await fetch_all(conn, SHADOW_SQL)
    closed = await fetch_one(conn, CLOSED_SQL)
    latency = await fetch_one(conn, LATENCY_SQL) or {}
    cost = await fetch_one(conn, COST_SQL, (today,)) or {}
    decisions = await fetch_one(conn, DECISIONS_SQL) or {}
    calls, tokens = int(cost.get("llm_calls") or 0), int(cost.get("llm_tokens") or 0)
    n_dec = int(decisions.get("n") or 0)
    return {
        "is_sample": is_sample,
        "label": SAMPLE_LABEL if is_sample else REAL_LABEL,
        "as_of": now,
        **empty_layers(),
        "l4": {
            "series": series,
            "since": {"v1_0": V1_0_START, "v1_1": V1_1_START},
            "closed_trades": int((closed or {}).get("n") or 0),
        },
        "latency": {"p50_s": _seconds(latency.get("p50")), "p95_s": _seconds(latency.get("p95")), "target_p95_s": 60},
        "cost": {
            "calls_today": calls,
            "tokens_today": tokens,
            "tokens_per_decision": tokens // n_dec if n_dec else 0,
        },
        "shadow": [
            {
                "proposal_id": r["proposal_id"],
                "ticker": r["ticker"],
                "rejected_by": r["rejected_by"],
                "shadow_return_20d": float(r["return_20d"]),
            }
            for r in shadow
        ],
    }
