"""One full live-graph run on synthetic prices (LLM_MODE=live tools, recorded model answers) that ends
in PROPOSE with the live sizer's numbers; and the same run without high/low data ends in HOLD.

World: ORNEK and XU100 over 300 sessions; ORNEK follows R = α + β·R_XU100 on closes, and six past E3
events carry an 8 % abnormal return on their entry session (so CAR[1,5] = 8 % exactly). The demo E3
text is re-published on DAYS[290] at 19:00 as a real (non-fixture) disclosure.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Final

import pytest

from kaptan.agents.scenario import run_graph
from kaptan.agents.tools import ReplayToolbox
from kaptan.db import DictConn
from kaptan.evidence import LiveToolbox
from kaptan.llm.provider import LLMRequest, LLMResult
from kaptan.llm.replay import ReplayProvider
from kaptan.market.ticks import floor_to_tick, price_limits
from tests.unit.agent_fixtures import context_for
from tests.unit.test_evidence_study import at, walk

pytestmark = pytest.mark.integration

RUN: Final = "run-demo-e3-ornek"
TICKER: Final = "ORNEK"
N: Final = 300
DAYS: Final = walk(date(2025, 1, 2), N)
ALPHA, BETA, RB_OC = 0.0002, 1.1, 0.002
AR: Final = 0.08
EVENT_IDX: Final = (200, 213, 226, 239, 252, 265)
FIRST_INDEX: Final = 991_000_001
PUB_IDX: Final = 290
RB: Final = [0.008 * (((i * 7) % 11) - 5) / 5 for i in range(N)]


def _closes(base: float, rets: list[float]) -> list[float]:
    out, c = [], base
    for i, r in enumerate(rets):
        c = c if i == 0 else c * (1 + r)
        out.append(c)
    return out


BENCH: Final = _closes(10_000.0, RB)
STOCK: Final = _closes(50.0, [ALPHA + BETA * b for b in RB])


def _d(x: float) -> Decimal:
    return Decimal(str(round(x, 6)))


async def _world(conn: DictConn, *, with_ranges: bool = True) -> None:
    ars = {i + 1: AR for i in EVENT_IDX}  # the entry session is the one after a publication at 11:00
    stock = []
    for i, d in enumerate(DAYS):
        close = STOCK[i]
        open_ = close / (1 + ((ALPHA + BETA * RB_OC + ars[i]) if i in ars else 0.0))
        hi, lo = (max(open_, close) * 1.001, min(open_, close) * 0.999) if with_ranges else (None, None)
        stock.append((TICKER, d, _d(open_), None if hi is None else _d(hi), None if lo is None else _d(lo),
                      _d(close), Decimal(10_000_000), _d(close) * 100_000_000, _d(close) * 30_000_000,
                      Decimal(100_000_000)))  # fmt: skip
    bench = [("XU100", d, _d(c / (1 + RB_OC)), _d(c)) for d, c in zip(DAYS, BENCH, strict=True)]
    events = [
        (FIRST_INDEX + k, TICKER, "ÖRNEK ENERJİ A.Ş.", at(DAYS[i], 11), at(DAYS[i], 11) + timedelta(seconds=60))
        for k, i in enumerate(EVENT_IDX)
    ]
    async with conn.cursor() as cur:
        await cur.executemany(
            "INSERT INTO core.prices_daily (ticker, d, open, high, low, close, turnover_try, mcap_try,"
            " free_float_mcap_try, capital_try, price_basis, source)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'raw', 'isyatirim')",
            stock,
        )
        await cur.executemany(
            "INSERT INTO core.prices_daily (ticker, d, open, close, price_basis, source)"
            " VALUES (%s, %s, %s, %s, 'adjusted', 'yfinance')",
            bench,
        )
        await cur.executemany(
            "INSERT INTO core.disclosures (disclosure_index, primary_ticker, company_name, disclosure_class,"
            " disclosure_type, subject, summary, reason, subject_route, subject_map_version, published_at,"
            " available_at, ingest_source, origin, visible)"
            " VALUES (%s, %s, %s, 'ODA', 'ODA', 'Yeni İş İlişkisi', '', 'NEW', 'E3', 'test', %s, %s,"
            " 'backfill', 'kap', false)",
            events,
        )


class _CitingProvider:
    """The recorded answers, except that the Evidence agent cites the six past events the tools offer."""

    name = "replay"

    def __init__(self) -> None:
        self.base = ReplayProvider()

    async def complete(self, request: LLMRequest) -> LLMResult:
        res = await self.base.complete(request)
        if request.agent != "evidence":
            return res
        selected = [
            {"ref_id": f"evt:kap:{FIRST_INDEX + k}", "relevance": "high", "why_similar_tr": "Aynı tür sözleşme."}
            for k in range(len(EVENT_IDX))
        ]
        return replace(res, output={**res.output, "selected": selected, "proposed_strength": "moderate"})


async def _run(conn: DictConn, thread: str) -> tuple[dict[str, Any], LiveToolbox]:
    ctx = context_for(RUN, published_at=at(DAYS[PUB_IDX], 19))
    disclosure = replace(ctx.disclosure, is_fixture=False)
    live = LiveToolbox(conn, disclosure, base=ReplayToolbox())
    state = await run_graph(replace(ctx, disclosure=disclosure, tools=live, provider=_CitingProvider()), thread)
    return dict(state), live


async def test_live_graph_proposes_with_the_live_sizer(pg: DictConn) -> None:
    await _world(pg)
    state, live = await _run(pg, "sizing-live-propose")
    assert state["outcome"] == "PROPOSE", state.get("rules")
    p, m = state["proposal"], state["merged"]
    close = _d(STOCK[PUB_IDX]).quantize(Decimal("0.01"))
    lower, upper = price_limits(_d(STOCK[PUB_IDX]))
    # merge: limits on the BIST grid from the last close (replay would say last × 1.1)
    assert (Decimal(str(m["lower_limit"])), Decimal(str(m["upper_limit"]))) == (lower, upper)
    assert m["evidence_n"] == 6 and m["e3_denominator"] == "market_cap"
    # sizer: after 18:10 → next session's opening auction, ref = that day's close
    assert p["entry"] == "next_open_auction" and Decimal(str(p["ref_price"])) == close
    assert Decimal(str(p["limit_price"])) == floor_to_tick(_d(STOCK[PUB_IDX]) * Decimal("1.02"))
    plan = live.sizing_plan
    assert plan is not None and not hasattr(plan, "reason")
    assert Decimal("0.04") <= Decimal(str(plan.stop_pct)) <= Decimal("0.06")  # E3 clamp
    assert p["holding_days_min"] == p["holding_days_max"] == 5
    assert 398 <= p["expected_edge_bps"] <= 400  # 0.5 × 8 % (firm and type means are both 8 %)
    assert p["est_cost_bps"] >= 30 and p["expected_edge_bps"] >= 2 * p["est_cost_bps"]
    assert p["multipliers"]["evidence"] == 0.5 and p["multipliers"]["skeptic"] == 0.5
    budget = Decimal(p["requested_notional_try"]) * Decimal("0.5") * Decimal("0.5")
    assert p["requested_qty"] == int(budget / Decimal(str(p["limit_price"])))
    card = state["approval_card"]
    assert card is not None and card["qty"] > 0 and card["entry"] == "next_open_auction"
    assert live.sizing(live.fp) == plan.tool_doc()  # the gate reads the same answer


async def test_live_graph_without_ranges_holds(pg: DictConn) -> None:
    await _world(pg, with_ranges=False)
    state, live = await _run(pg, "sizing-live-hold")
    assert state["outcome"] == "HOLD" and state["proposal"] is None
    assert getattr(live.sizing_plan, "reason", None) == "no_atr" and live.sizing(live.fp) is None
