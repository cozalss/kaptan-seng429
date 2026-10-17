"""Shared helpers for the KAP ingestion tests: recorded fixtures and an offline fake KAP client.

Fixtures were recorded once from kap.org.tr on 2026-10-17 (see tests/fixtures/kap_json/manifest.json);
no test talks to KAP except the opt-in `-m live` smoke test.
"""

from __future__ import annotations

import json
from datetime import date
from functools import cache
from pathlib import Path
from typing import Any, Final

from kaptan.ingest.kap_client import KapError, KapNotFoundError

FIXTURES: Final = Path(__file__).resolve().parent / "fixtures"
KAP_JSON: Final = FIXTURES / "kap_json"
DAY_15: Final = date(2026, 10, 15)
DAY_16: Final = date(2026, 10, 16)


@cache
def manifest() -> dict[str, Any]:
    data: dict[str, Any] = json.loads((KAP_JSON / "manifest.json").read_text(encoding="utf-8"))
    return data


def load_json(name: str) -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = json.loads((KAP_JSON / name).read_text(encoding="utf-8"))
    return data


def list_main(day: date) -> list[dict[str, Any]]:
    return load_json(f"list_main_{day.isoformat()}.json")


def by_criteria(day: date) -> list[dict[str, Any]]:
    return load_json(f"by_criteria_{day.isoformat()}.json")


def companies() -> list[dict[str, Any]]:
    return load_json("company_items_IGS_A.json")


def detail_text(idx: int) -> str:
    return (FIXTURES / "detail_text" / f"{idx}.txt").read_text(encoding="utf-8")


def detail_pdf(idx: int) -> bytes:
    return (FIXTURES / "detail_pdf" / f"{idx}.pdf").read_bytes()


def detail_html(idx: int) -> str:
    return (FIXTURES / "detail_html" / f"{idx}.html").read_text(encoding="utf-8")


def subject_of(idx: int) -> str:
    return str(manifest()["detail_text"][str(idx)])


class FakeKap:
    """Duck-typed KapClient serving the fixtures; records every call. `errors` maps a method to an
    exception raised on its next call(s)."""

    def __init__(self, *, lists: dict[date, list[dict[str, Any]]] | None = None) -> None:
        self.lists = lists if lists is not None else {DAY_15: list_main(DAY_15), DAY_16: list_main(DAY_16)}
        self.criteria: dict[tuple[date, str], list[dict[str, Any]]] = {(DAY_16, ""): by_criteria(DAY_16)}
        self.calls: list[tuple[str, Any]] = []
        self.errors: dict[str, list[Exception]] = {}
        self.requests_made = 0

    async def __aenter__(self) -> FakeKap:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    def _maybe_raise(self, method: str) -> None:
        queue = self.errors.get(method)
        if queue:
            raise queue.pop(0)

    async def list_main(self, day_from: date, day_to: date) -> list[dict[str, Any]]:
        self.calls.append(("list_main", day_from))
        self._maybe_raise("list_main")
        return list(self.lists.get(day_from, []))

    async def by_criteria(self, day_from: date, day_to: date, disclosure_class: str = "") -> list[dict[str, Any]]:
        self.calls.append(("by_criteria", (day_from, disclosure_class)))
        self._maybe_raise("by_criteria")
        return list(self.criteria.get((day_from, disclosure_class), []))

    async def company_items(self, member_type: str = "IGS", state: str = "A") -> list[dict[str, Any]]:
        self.calls.append(("company_items", member_type))
        self._maybe_raise("company_items")
        return companies()

    async def bildirim_pdf(self, idx: int) -> bytes:
        self.calls.append(("bildirim_pdf", idx))
        self._maybe_raise("bildirim_pdf")
        path = FIXTURES / "detail_pdf" / f"{idx}.pdf"
        if path.exists():
            return path.read_bytes()
        if (FIXTURES / "detail_html" / f"{idx}.html").exists():
            raise KapNotFoundError(f"no pdf fixture for {idx}")
        raise KapError(f"no fixture for {idx}")

    async def bildirim_html(self, idx: int) -> str:
        self.calls.append(("bildirim_html", idx))
        self._maybe_raise("bildirim_html")
        path = FIXTURES / "detail_html" / f"{idx}.html"
        if not path.exists():
            raise KapNotFoundError(f"no html fixture for {idx}")
        return path.read_text(encoding="utf-8")
