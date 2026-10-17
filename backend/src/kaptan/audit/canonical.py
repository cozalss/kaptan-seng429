"""Byte-for-byte port of kaptan-panel/src/lib/audit-chain.ts (canonical JSON + sha256 chain).

    canonical = JSON.stringify([chain_pos, occurred_at, actor, action, entity_type, entity_id,
                                run_id, strategy_version, sortKeys(payload)])
    hash      = sha256_hex(prev_hash + canonical)        genesis prev_hash = "00"

`js_json()` reproduces ECMAScript `JSON.stringify` (no spaces, Number::toString for numbers,
the same string escapes, integer-like object keys first in numeric order) so Python and the
panel hash identical records to identical digests (tests/unit/test_audit_cross_language.py).
"""

from __future__ import annotations

import hashlib
import math
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from kaptan.domain.schemas._base import iso_ms

GENESIS_PREV_HASH: Final = "00"
_MAX_ARRAY_INDEX: Final = 2**32 - 2
_JS_ESCAPES: Final = {'"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t"}


@dataclass(frozen=True, slots=True)
class ChainFields:
    """Everything the hash covers (AuditEntry without seq, prev_hash and hash)."""

    chain_pos: int
    occurred_at: str  # toISOString(): "2027-01-11T10:40:00.000Z"
    actor: str
    action: str
    entity_type: str
    entity_id: str
    run_id: str | None
    strategy_version: str | None
    payload: Mapping[str, Any]


def js_number(value: float | int) -> str:
    """ECMAScript Number::toString(10) for a finite number (JSON.stringify writes null otherwise)."""
    if isinstance(value, bool):  # pragma: no cover - guarded by the caller
        raise TypeError("bool is not a number")
    if isinstance(value, int) and abs(value) < 10**21:
        return str(value)
    x = float(value)
    if not math.isfinite(x):
        return "null"
    if x == 0:
        return "0"  # also -0
    sign = "-" if x < 0 else ""
    # repr() is the shortest round-tripping decimal, like V8; re-lay its digits out per ECMA-262.
    digits_tuple = Decimal(repr(abs(x))).as_tuple()
    digits = "".join(map(str, digits_tuple.digits)).rstrip("0") or "0"
    exp = int(digits_tuple.exponent)  # value = int(all digits) * 10**exp
    k = len(digits)
    n = len(digits_tuple.digits) + exp  # value = 0.d1d2..dk * 10**n
    if k <= n <= 21:
        body = digits + "0" * (n - k)
    elif 0 < n <= 21:
        body = f"{digits[:n]}.{digits[n:]}"
    elif -6 < n <= 0:
        body = "0." + "0" * (-n) + digits
    else:
        e = n - 1
        mantissa = digits if k == 1 else f"{digits[0]}.{digits[1:]}"
        body = f"{mantissa}e{'+' if e >= 0 else '-'}{abs(e)}"
    return sign + body


def js_string(text: str) -> str:
    """JSON.stringify for a string (well-formed: lone surrogates escaped)."""
    out = ['"']
    for ch in text:
        code = ord(ch)
        if ch in _JS_ESCAPES:
            out.append(_JS_ESCAPES[ch])
        elif code < 0x20 or 0xD800 <= code <= 0xDFFF:
            out.append(f"\\u{code:04x}")
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def _is_array_index(key: str) -> bool:
    return key.isdigit() and key.isascii() and (key == "0" or key[0] != "0") and int(key) <= _MAX_ARRAY_INDEX


def _js_key_order(keys: list[str]) -> list[str]:
    """Property order of a JS object built from sorted keys: array indices ascending, then the rest."""
    index_keys = sorted((k for k in keys if _is_array_index(k)), key=int)
    # Array.prototype.sort() compares UTF-16 code units.
    other = sorted((k for k in keys if not _is_array_index(k)), key=lambda k: k.encode("utf-16-be"))
    return index_keys + other


def js_json(value: Any, *, sort_keys: bool = False) -> str:
    """JSON.stringify(value) — with `sort_keys`, JSON.stringify(sortKeys(value))."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return js_string(value)
    if isinstance(value, int | float | Decimal):
        return js_number(float(value) if isinstance(value, Decimal) else value)
    if isinstance(value, datetime):
        return js_string(iso_ms(value))
    if isinstance(value, list | tuple):
        return "[" + ",".join(js_json(v, sort_keys=sort_keys) for v in value) + "]"
    if isinstance(value, Mapping):
        keys = [str(k) for k in value]
        ordered = _js_key_order(keys) if sort_keys else keys
        lookup = {str(k): v for k, v in value.items()}
        return "{" + ",".join(f"{js_string(k)}:{js_json(lookup[k], sort_keys=sort_keys)}" for k in ordered) + "}"
    raise TypeError(f"not JSON-serialisable for the audit chain: {type(value).__name__}")


def canonical_of(fields: ChainFields) -> str:
    head = js_json(
        [
            fields.chain_pos,
            fields.occurred_at,
            fields.actor,
            fields.action,
            fields.entity_type,
            fields.entity_id,
            fields.run_id,
            fields.strategy_version,
        ]
    )
    return head[:-1] + "," + js_json(dict(fields.payload), sort_keys=True) + "]"


def hash_of(prev_hash: str, fields: ChainFields) -> str:
    return hashlib.sha256((prev_hash + canonical_of(fields)).encode("utf-8")).hexdigest()
