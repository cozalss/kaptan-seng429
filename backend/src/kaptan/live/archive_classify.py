"""Optional, off by default: the Classifier on old free-text notices, under a hard budget.

Subject-mapped notices (E1, E2, E3 "Yeni İş İlişkisi" / "İhale", E4) are typed without a model, the same way the live
graph types them, so the archive's evidence needs no LLM. Free-text subjects ("Özel Durum Açıklaması (Genel)" & co.,
`subject_route = 'llm'`) are typed only by the Classifier: without this step the evidence misses the E3 (and rarely
E1/E2) events written that way. Both limits must be given; the run stops before the call that could cross either one,
pricing every call at the dearest paid model of the chain even when a free tier answered.

What it stores is what a live run stores (`classification` with method 'llm'). It reads no return; a notice with an
injection pattern gets no label, as the live guard's quarantine gives none; a failed call leaves the row for next time.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Final

from psycopg.types.json import Jsonb

from kaptan.agents.nodes.screen import regex_hits
from kaptan.domain.schemas.agents import ClassifierOutput
from kaptan.ingest import repo as kap_repo
from kaptan.ingest.detail_fetcher import reason_from
from kaptan.ingest.kap_client import KapBlockedError, KapError
from kaptan.ingest.kap_detail import DetailText
from kaptan.ingest.parsers import parse_detail
from kaptan.llm.provider import LLMProvider, LLMRequest, ProviderError, agent_inputs, prompt_version
from kaptan.llm.registry import ModelsConfig, Pricing
from kaptan.reference._sql import fetch_all

log = logging.getLogger("kaptan.live.archive_classify")

AGENT: Final = "classifier"
#: Characters per token: Turkish text in these models is ~3.5; the lower figure over-estimates, which is the safe side.
CHARS_PER_TOKEN: Final = 3.0
#: The prompt around the text: recorded runs show 1 800 tokens in for a short notice, so this is on the safe side too.
PROMPT_TOKENS: Final = 2000

TODO_SQL: Final = """
SELECT d.disclosure_index, d.primary_ticker AS ticker, d.subject, t.body AS text_tr
  FROM core.disclosures d LEFT JOIN core.disclosure_texts t ON t.disclosure_index = d.disclosure_index AND t.lang = 'tr'
 WHERE d.origin = 'kap' AND d.subject_route = 'llm' AND d.classification IS NULL AND d.primary_ticker IS NOT NULL
   AND NOT d.is_noise AND d.published_at >= %(lo)s AND d.published_at < %(hi)s
   AND NOT EXISTS (SELECT 1 FROM ops.ingestion_runs r WHERE r.job = 'archive_classify' AND r.status = 'done'
                    AND r.key = d.disclosure_index::text)
 ORDER BY d.published_at DESC, d.disclosure_index DESC
 LIMIT %(n)s
"""
JOB: Final = "archive_classify"
STORE_SQL: Final = "UPDATE core.disclosures SET classification = %s, updated_at = now() WHERE disclosure_index = %s"
COUNT_SQL: Final = """
SELECT count(*)::int AS n FROM core.disclosures d
 WHERE d.origin = 'kap' AND d.subject_route = 'llm' AND d.classification IS NULL AND d.primary_ticker IS NOT NULL
   AND NOT d.is_noise AND d.published_at >= %(lo)s AND d.published_at < %(hi)s
"""

FetchText = Callable[[Any, int], Awaitable[DetailText]]


@dataclass(frozen=True, slots=True)
class ClassifyBudget:
    max_calls: int
    max_usd: float


@dataclass(slots=True)
class ClassifyResult:
    remaining_before: int = 0
    calls: int = 0
    spent_usd: float = 0.0
    labels: dict[str, int] = field(default_factory=dict)
    quarantined: int = 0
    failed: int = 0
    stopped_by: str | None = None

    def as_doc(self) -> dict[str, Any]:
        return {
            "remaining_before": self.remaining_before, "calls": self.calls, "spent_usd": round(self.spent_usd, 4),
            "labels": self.labels, "quarantined": self.quarantined, "failed": self.failed,
            "stopped_by": self.stopped_by,
        }  # fmt: skip


def dearest_price(models: ModelsConfig) -> Pricing | None:
    """The chain's most expensive paid model; a chain of free tiers has none and is refused by the caller."""
    specs = [models.providers[key] for key in models.chain_for(AGENT)]
    prices = [s.price_usd_per_mtok for s in specs if s.price_usd_per_mtok is not None]
    return max(prices, key=lambda p: (p.input_cache_miss, p.output), default=None)


def worst_call_usd(text: str, price: Pricing, max_output: int) -> float:
    tokens_in = PROMPT_TOKENS + int(len(text) / CHARS_PER_TOKEN)
    return price.cost_usd(tokens_in, max_output)


def request_for(ticker: str, subject: str, index: int, text: str) -> LLMRequest:
    return LLMRequest(
        agent=AGENT,
        prompt_version=prompt_version(AGENT),
        inputs=agent_inputs(ticker, text),
        output_schema=ClassifierOutput,
        run_id=f"archive-{index}",
        document=text,
        context={"ticker": ticker, "subject": subject},
    )


async def _text_of(conn: Any, kap: Any, fetch_text: FetchText, row: dict[str, Any]) -> str | None:
    if row["text_tr"]:
        return str(row["text_tr"])
    index = int(row["disclosure_index"])
    await conn.commit()  # no transaction stays open across a request
    try:
        detail = await fetch_text(kap, index)
    except KapBlockedError:
        raise
    except KapError as exc:
        log.info("text %s: %s", index, exc)
        return None
    parsed = parse_detail(str(row["subject"]), detail.tr)
    async with conn.transaction():
        await kap_repo.store_detail(conn, detail, parsed, reason_from(parsed))
    return detail.tr


async def _settle(conn: Any, index: int, label: dict[str, Any] | None, status: str, error: str | None = None) -> None:
    async with conn.transaction():
        if label is not None:
            await conn.execute(STORE_SQL, (Jsonb(label), index))
        await kap_repo.mark_run(conn, JOB, str(index), status, error=error)


async def _classify_one(
    conn: Any, provider: LLMProvider, row: dict[str, Any], text: str, price: Pricing, result: ClassifyResult
) -> None:
    index = int(row["disclosure_index"])
    if regex_hits(text):  # the live guard quarantines this text: no model reads it, no label
        result.quarantined += 1
        await _settle(conn, index, None, "done", "quarantined: injection pattern")
        return
    result.calls += 1
    await conn.commit()
    try:
        answer = await provider.complete(request_for(str(row["ticker"]), str(row["subject"]), index, text))
    except ProviderError as exc:
        result.failed += 1
        log.warning("classifier %s: %s", index, type(exc).__name__)
        return
    result.spent_usd += price.cost_usd(answer.usage.tokens_in, answer.usage.tokens_out)
    output = answer.output
    if output.get("injection_suspected") or output.get("event_type") is None:
        result.quarantined += 1
        await _settle(conn, index, None, "done", "no label from the model")
        return
    label = {"event_type": output["event_type"], "confidence": output["confidence"], "method": "llm"}
    await _settle(conn, index, label, "done")
    result.labels[label["event_type"]] = result.labels.get(label["event_type"], 0) + 1


async def run_classify(
    pool: Any,
    provider: LLMProvider,
    kap: Any,
    fetch_text: FetchText,
    budget: ClassifyBudget,
    models: ModelsConfig,
    *,
    lo: datetime,
    hi: datetime,
) -> ClassifyResult:
    """Newest first (the type mix of today's market), stopping before the call that could cross a limit."""
    price = dearest_price(models)
    if price is None:
        raise ValueError("the classifier chain has no priced model: the dollar ceiling could not be enforced")
    max_output = models.max_output_tokens(AGENT, 10_000)
    result = ClassifyResult()
    async with pool.connection() as conn:
        count = await fetch_all(conn, COUNT_SQL, {"lo": lo, "hi": hi})
        result.remaining_before = int(count[0]["n"])
        rows = await fetch_all(conn, TODO_SQL, {"lo": lo, "hi": hi, "n": budget.max_calls})
        await conn.commit()
        log.info(
            "classifier: %d notices without a type; this run may make %d calls, %.2f USD at most",
            result.remaining_before, budget.max_calls, budget.max_usd,
        )  # fmt: skip
        for row in rows:
            text = await _text_of(conn, kap, fetch_text, row)
            if text is None:
                result.failed += 1
                continue
            if result.spent_usd + worst_call_usd(text, price, max_output) > budget.max_usd:
                result.stopped_by = "max_usd"
                break
            await _classify_one(conn, provider, row, text, price, result)
        if result.stopped_by is None and result.remaining_before > budget.max_calls:
            result.stopped_by = "max_calls"
    log.info("classifier: %s", result.as_doc())
    return result
