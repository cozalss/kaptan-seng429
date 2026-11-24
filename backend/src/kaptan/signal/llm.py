"""The optional model line for an important disclosure of a held or watched stock (never in the ingest path).

One cheap call through the existing live provider (`kaptan.llm`: masking, cache, daily caps, usage rows). The agent
`liner` runs on the free tiers only (config/models.yaml). The answer is checked here before it is kept: a length
limit, a tone from the fixed list, no number that the disclosure text does not contain, no advice words. Only a
checked answer is stored (`core.signal_line`, keyed by the disclosure and the prompt version + hash). A failure, a
quota stop or a rejected answer stores nothing: the rule-made line stays and nothing is retried in a hurry.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from typing import Any, Final, Literal, Protocol, cast

from pydantic import Field

from kaptan.domain.schemas._base import KModel
from kaptan.llm.prompts import load_prompt
from kaptan.llm.provider import LLMRequest, LLMResult, ProviderError, prompt_version
from kaptan.reference._sql import execute, fetch_all
from kaptan.signal.lines import LINE_MAX, TONES, Reading, Tone, clip

log = logging.getLogger("kaptan.signal")

AGENT: Final = "liner"
SO_WHAT_MAX: Final = 200
TEXT_MAX: Final = 6000
RECENT: Final = timedelta(days=2)
BATCH: Final = 8
_NUMBER: Final = re.compile(r"\d[\d.,]*")
_ADVICE: Final = re.compile(r"(?i)\b(almalısın|satmalısın|tutmalısın|hedef fiyat|tavsiye|öneriyoruz|al\b|sat\b)")


class LinerOutput(KModel):
    line: str = Field(max_length=400)
    tone: Literal["olumlu", "olumsuz", "notr", "belirsiz"]
    so_what: str | None = Field(default=None, max_length=600)


class Liner(Protocol):
    async def complete(self, request: LLMRequest) -> LLMResult: ...


def cache_version() -> str:
    """The key of the cache: prompt version plus the first 8 hex of the prompt text hash (an edit writes new rows)."""
    return f"{prompt_version(AGENT)}:{load_prompt(prompt_version(AGENT)).sha256[:8]}"


def _digits(text: str) -> set[str]:
    return {re.sub(r"\D", "", m) for m in _NUMBER.findall(text)} - {""}


def validate(output: dict[str, Any], text: str, subject: str = "") -> Reading | None:
    """The checked reading, or None when the answer cannot be kept (pure)."""
    line = " ".join(str(output.get("line") or "").split())
    tone = output.get("tone")
    so_what_raw = output.get("so_what")
    so_what = " ".join(str(so_what_raw).split()) if so_what_raw else None
    if not line or len(line) > LINE_MAX or tone not in TONES:
        return None
    if so_what is not None and len(so_what) > SO_WHAT_MAX:
        return None
    allowed = _digits(f"{text} {subject}")
    said = _digits(line) | (_digits(so_what) if so_what else set())
    if not said <= allowed:
        return None
    if _ADVICE.search(line) or (so_what and _ADVICE.search(so_what)):
        return None
    return Reading(clip(line), cast(Tone, tone), so_what, thin=False)


def request_for(index: int, ticker: str, subject: str, text: str) -> LLMRequest:
    return LLMRequest(
        agent=AGENT,
        prompt_version=prompt_version(AGENT),
        inputs={"index": index, "ticker": ticker},
        output_schema=LinerOutput,
        run_id=f"liner-{index}",
        document=text[:TEXT_MAX],
        context={"kap_subject": subject, "ticker": ticker},
    )


PENDING_SQL: Final = """
SELECT d.disclosure_index, d.primary_ticker AS ticker, d.subject, t.body AS text_tr
  FROM core.disclosures d
  JOIN core.disclosure_texts t ON t.disclosure_index = d.disclosure_index AND t.lang = 'tr'
 WHERE d.disclosure_index = ANY(%(ids)s)
   AND NOT EXISTS (SELECT 1 FROM core.signal_line s
                    WHERE s.disclosure_index = d.disclosure_index AND s.prompt_version = %(version)s)
"""
STORE_SQL: Final = """
INSERT INTO core.signal_line (disclosure_index, prompt_version, line, tone, so_what)
VALUES (%s, %s, %s, %s, %s) ON CONFLICT (disclosure_index, prompt_version) DO NOTHING
"""


async def enrich(conn: Any, provider: Liner, ids: list[int]) -> int:
    """Ask the model about these disclosures (only those with a stored text and no line yet); returns lines stored.

    The caller decides which ones are worth a call (important, mine, thin). Never raises for a model failure.
    """
    if not ids:
        return 0
    from kaptan.agents.nodes.screen import regex_hits  # the live guard's own pattern list

    version = cache_version()
    rows = await fetch_all(conn, PENDING_SQL, {"ids": ids[:BATCH], "version": version})
    stored = 0
    for row in rows:
        text, subject = str(row["text_tr"]), str(row["subject"] or "")
        if regex_hits(text):  # the live guard quarantines this text: no model reads it
            continue
        await conn.commit()  # no transaction stays open across a request
        try:
            answer = await provider.complete(
                request_for(int(row["disclosure_index"]), str(row["ticker"] or ""), subject, text)
            )
        except ProviderError as exc:
            log.info("liner %s: %s", row["disclosure_index"], type(exc).__name__)
            break  # quota or provider trouble: stop for now, the rule line stays
        read = validate(dict(answer.output), text, subject)
        if read is None:
            log.info("liner %s: answer rejected", row["disclosure_index"])
            continue
        await execute(conn, STORE_SQL, (int(row["disclosure_index"]), version, read.line, read.tone, read.so_what))
        await conn.commit()
        stored += 1
    return stored


async def enrich_recent(conn: Any, provider: Liner, now: datetime) -> int:
    """The scheduler's step: thin, important disclosures of my stocks from the last two days."""
    from kaptan.signal.store import thin_mine_ids

    return await enrich(conn, provider, await thin_mine_ids(conn, now - RECENT, now))
