"""Structured output plumbing: the provider-portable JSON Schema of an agent schema, parsing model
text into one JSON object, and validating it (05 §2.4, `09` L5: model output is untrusted input).
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from functools import lru_cache
from typing import Any, Final

from pydantic import BaseModel, ValidationError

from kaptan.llm.transport import InvalidOutputError

#: JSON Schema keywords every provider in the chain understands (Gemini's subset, 2026-10).
_KEEP: Final = frozenset(
    {"type", "properties", "required", "items", "enum", "anyOf", "description", "minimum", "maximum",
     "minItems", "maxItems", "minLength", "maxLength"}
)  # fmt: skip
_FENCE: Final = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.I)
REPAIR_MSG: Final = (
    "Önceki çıktın istenen JSON şemasına uymadı.\nDoğrulama hatası: {err}\n"
    "YALNIZCA düzeltilmiş JSON nesnesini döndür; açıklama ekleme."
)


def _resolve(node: Any, defs: Mapping[str, Any]) -> Any:
    if isinstance(node, list):
        return [_resolve(x, defs) for x in node]
    if not isinstance(node, dict):
        return node
    ref = node.get("$ref")
    if isinstance(ref, str) and ref.startswith("#/$defs/"):
        return _resolve(defs[ref.removeprefix("#/$defs/")], defs)
    out: dict[str, Any] = {}
    for key, value in node.items():
        if key == "const":
            out["enum"] = [value]
        elif key == "prefixItems":  # tuple[float, float] → fixed-length array
            items = _resolve(value, defs)
            out["items"] = items[0] if items else {}
            out["minItems"] = out["maxItems"] = len(items)
        elif key == "properties":
            out[key] = {name: _resolve(v, defs) for name, v in value.items()}
        elif key in _KEEP:
            out[key] = _resolve(value, defs)
    return _collapse_nullable(out)


def _collapse_nullable(node: dict[str, Any]) -> dict[str, Any]:
    """anyOf [X, {type: null}] with a plain-typed X → X with type [X.type, "null"]."""
    variants = node.get("anyOf")
    if not isinstance(variants, list) or len(variants) != 2:
        return node
    nulls = [v for v in variants if v == {"type": "null"}]
    others = [v for v in variants if v != {"type": "null"}]
    if len(nulls) != 1 or not isinstance(others[0].get("type"), str):
        return node
    merged = {**others[0], "type": [others[0]["type"], "null"]}
    rest = {k: v for k, v in node.items() if k != "anyOf"}
    return {**merged, **rest}


@lru_cache(maxsize=64)
def _schema_json(schema: type[BaseModel]) -> str:
    raw = schema.model_json_schema()
    return json.dumps(_resolve(raw, raw.get("$defs", {})), ensure_ascii=False, sort_keys=True)


def portable_schema(schema: type[BaseModel]) -> dict[str, Any]:
    """The schema with `$ref`s inlined and only portable keywords kept (fresh copy per call)."""
    loaded: dict[str, Any] = json.loads(_schema_json(schema))
    return loaded


def parse_object(text: str, *, provider: str) -> dict[str, Any]:
    """Model text → one JSON object (tolerates code fences and prose around the object)."""
    body = _FENCE.sub("", text or "").strip()
    if not body.startswith("{"):
        start, end = body.find("{"), body.rfind("}")
        body = body[start : end + 1] if 0 <= start < end else body
    try:
        obj = json.loads(body)
    except json.JSONDecodeError as exc:
        raise InvalidOutputError(f"{provider}: not JSON ({exc.msg})", provider=provider) from None
    if not isinstance(obj, dict):
        raise InvalidOutputError(f"{provider}: JSON is not an object", provider=provider)
    return obj


def validate_against(schema: type[BaseModel] | None, obj: dict[str, Any], *, provider: str) -> dict[str, Any]:
    """Schema-check; returns the normalised document (only schema fields, JSON types)."""
    if schema is None:
        return obj
    try:
        model = schema.model_validate(obj)
    except ValidationError as exc:
        errors = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors()[:6])
        raise InvalidOutputError(f"{provider}: schema mismatch ({errors})", provider=provider) from None
    dumped: dict[str, Any] = _whole_numbers(model.model_dump(mode="json"))
    return dumped


def _whole_numbers(value: Any) -> Any:
    """24.0 → 24, as JSON (and the recorded outputs) would have it: downstream code mixes these with
    Decimal and ints (e.g. a contract's duration in months), where a float would raise."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {k: _whole_numbers(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_whole_numbers(v) for v in value]
    return value


def repair_message(error: Exception) -> str:
    return REPAIR_MSG.format(err=str(error)[:800])
