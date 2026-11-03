"""What the code knows about an E2's attachment, and how it holds the Reader to it.

The trade figures of an E2 come from the table the ingest parser checked (`ingest.parsers.insider_form`), never from
the model: verified rows overwrite what the Reader reports, as `evidence.card` does for Materiality. When the
attachment could not be read there is nothing to read: no model is asked, the answer is an abstain that says why
(05 §4.2, `attachment_missing` → HOLD). When there is text but no verified table, every figure the Reader gives must
appear in the text, or it abstains.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Final

from kaptan.ingest.parsers.common import numbers
from kaptan.ingest.parsers.insider_holder import holder_kind
from kaptan.rules.params import E2_ROLES

_NOTE_READ: Final = "İşlem rakamları ekteki tablodan kodla alındı."
_NOTE_INVENTED: Final = "Okuyucunun verdiği işlem rakamları metinde yok."
_NOTE_THRESHOLD: Final = "Bu bir kurumsal yatırımcının pay eşiği bildirimi: yönetici alımı değil."
_DIGITS: Final = re.compile(r"\d")
#: 05 §1.4 md.12/b lists 5 % and up; the real forms also report 3 % ("%3 eşiğini yukarı yönlü olarak aşmıştır").
_THRESHOLD_LEVELS: Final = tuple(Decimal(n) for n in (3, 5, 10, 15, 20, 25, 33, 50, 67, 95))
_MAJORITY_PCT: Final = Decimal(50)


@dataclass(frozen=True, slots=True)
class AttachmentFacts:
    """From `core.disclosures.parsed`: read (verified rows) | no_table (text, no verified row) | unreadable."""

    status: str
    reason: str | None = None
    rows: tuple[Mapping[str, Any], ...] = ()
    price_low: Decimal | None = None
    price_high: Decimal | None = None


def _dec(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return None


def attachment_facts(parsed: Mapping[str, Any] | None) -> AttachmentFacts | None:
    """None: the disclosure did not go through the attachment path, so nothing here applies."""
    status = (parsed or {}).get("attachment_status")
    if parsed is None or status is None:
        return None
    return AttachmentFacts(
        status=str(status),
        reason=parsed.get("attachment_reason"),
        rows=tuple(parsed.get("rows") or ()),
        price_low=_dec(parsed.get("price_low_try")),
        price_high=_dec(parsed.get("price_high_try")),
    )


def unreadable_answer(facts: AttachmentFacts) -> dict[str, Any]:
    """The Reader's document when the trade table cannot be read: valid E2 schema, no figure in it."""
    reason = facts.reason or "Ek okunamadı."
    return {
        "kind": "E2",
        "status": "abstain",
        "confidence": 0.0,
        "injection_suspected": False,
        "quotes": [{"field": "attachment", "quote": reason}],
        "notes_tr": f"Ek okunamadı: işlem rakamları bilinmiyor. {reason}"[:300],
        "abstain": {"reason": "attachment_missing", "detail_tr": reason[:300]},
        "filer_kind": "unknown",
        "person_or_entity": "unknown",
        "role": "unknown",
        "legal_basis": None,
        "direction": "mixed",
        "trades": [],
        "holding_before_pct": None,
        "holding_after_pct": None,
        "open_market": None,
        "non_market_reason": None,
    }


def _trades(facts: AttachmentFacts) -> list[dict[str, Any]]:
    price = facts.price_low if facts.price_low is not None and facts.price_low == facts.price_high else None
    out: list[dict[str, Any]] = []
    for row in facts.rows:
        for column in ("buy_nominal_try", "sell_nominal_try"):
            qty = _dec(row.get(column))
            if qty:
                out.append(
                    {
                        "trade_date": row["date"],
                        "qty": float(qty),
                        "price_tl": None if price is None else float(price),
                        "value_tl": None,
                    }
                )
    return out


def _direction(rows: tuple[Mapping[str, Any], ...]) -> str | None:
    bought = any(_dec(r.get("buy_nominal_try")) for r in rows)
    sold = any(_dec(r.get("sell_nominal_try")) for r in rows)
    if bought and sold:
        return "mixed"
    if bought:
        return "buy"
    return "sell" if sold else None


def _pct(row: Mapping[str, Any], column: str) -> float | None:
    value = _dec(row.get(column))
    return None if value is None else float(value)


def _in_text(value: Any, known: set[Decimal]) -> bool:
    number = _dec(value)
    return number is None or number in known


def _crossed(row_first: Mapping[str, Any], row_last: Mapping[str, Any], start: str, end: str) -> bool:
    before, after = _dec(row_first.get(start)), _dec(row_last.get(end))
    if before is None or after is None:
        return False
    low, high = sorted((before, after))
    return any(low < level <= high for level in _THRESHOLD_LEVELS)


def is_threshold_notice(text: str, rows: Sequence[Mapping[str, Any]]) -> bool:
    """06 §3.2, 05 Ö-4: a company crossing a stake threshold without holding the majority is not an insider buying.

    The holder comes from the form and the stake from the verified table, so a model's reading of the signatory's
    title cannot change it. A person is never caught here, nor is a company that does not cross a level (a holding
    company at 48 % adding a little): for those the rule still reads the Reader's `role`.
    """
    if not rows or holder_kind(text) != "entity":
        return False
    first, last = rows[0], rows[-1]
    ends = [_dec(last.get("end_capital_pct")), _dec(last.get("end_vote_pct"))]
    if any(end is not None and end >= _MAJORITY_PCT for end in ends):
        return False
    return _crossed(first, last, "start_capital_pct", "end_capital_pct") or _crossed(
        first, last, "start_vote_pct", "end_vote_pct"
    )


def _as_threshold_notice(doc: Mapping[str, Any]) -> dict[str, Any]:
    role = doc.get("role") if doc.get("role") not in E2_ROLES else "other_5pct_holder"
    notes = f"{doc.get('notes_tr') or ''} {_NOTE_THRESHOLD}".strip()
    return {**doc, "filer_kind": "entity", "role": role, "notes_tr": notes, "holder_threshold_notice": True}


def ground_insider(out: Mapping[str, Any], facts: AttachmentFacts, text: str) -> dict[str, Any]:
    """A new Reader document with its figures held to the facts. An abstain stays an abstain."""
    doc = dict(out)
    if doc.get("status") != "ok":
        return doc
    if facts.rows:
        notes = f"{doc.get('notes_tr') or ''} {_NOTE_READ}".strip()
        grounded = {
            **doc,
            "trades": _trades(facts),
            "direction": _direction(facts.rows) or doc.get("direction"),
            "holding_before_pct": _pct(facts.rows[0], "start_capital_pct"),
            "holding_after_pct": _pct(facts.rows[-1], "end_capital_pct"),
            "notes_tr": notes,
        }
        return _as_threshold_notice(grounded) if is_threshold_notice(text, facts.rows) else grounded
    known = set(numbers(text))
    figures = [t.get(k) for t in doc.get("trades") or [] for k in ("qty", "value_tl", "price_tl")]
    if all(_in_text(f, known) for f in figures):
        return doc
    return {
        **doc,
        "status": "abstain",
        "confidence": 0.0,
        "trades": [],
        "holding_before_pct": None,
        "holding_after_pct": None,
        "notes_tr": _NOTE_INVENTED,
        "abstain": {"reason": "conflicting_values", "detail_tr": _NOTE_INVENTED},
    }


__all__ = ["AttachmentFacts", "attachment_facts", "ground_insider", "is_threshold_notice", "unreadable_answer"]
