"""Writes the data the Cloudflare Worker (`cloud-watcher/`) shares with the backend, so there is one source of truth.

    uv run python scripts/export_cloud_data.py           # rewrite the generated JSON files
    uv run python scripts/export_cloud_data.py --check   # exit 1 when a file is out of date (CI does this as a test)

Files:
- `subject_map.json`: KAP subject (as `norm_key`) -> route, route -> kind, the digest's exact-subject lines, the kind
  order and titles, the plain lines and tones the rules give when no parsed detail exists (the Worker only sees the list
  row), and `norm_vectors` (raw text -> `norm_key`) that the Worker's own normaliser must reproduce.
- `calendar.json`: the BIST holidays (2018-2027) and half days.
- `test/fixtures/parity.json`: recorded KAP rows with the backend's verdict on each, for the Worker's parity test.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Final

from kaptan.digest import kinds
from kaptan.ingest.normalize import normalize_rows
from kaptan.ingest.subject_routes import _ROUTES, SUBJECT_MAP_VERSION
from kaptan.prices import calendar as bist
from kaptan.signal import lines
from kaptan.text.turkish import norm_key

ROOT: Final = Path(__file__).resolve().parents[2]
OUT_DIR: Final = ROOT / "cloud-watcher" / "src" / "generated"
FIXTURE_DIR: Final = ROOT / "cloud-watcher" / "test" / "fixtures"
RECORDED: Final = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "kap_json" / "list_main_2026-10-16.json"
KEEP_PLAIN: Final = 60
KEEP_NOISE: Final = 5
NORM_SAMPLES: Final = (
    "Pay  Satış Bilgi Formu",
    "İhale Süreci / Sonucu",
    "Özel Durum Açıklaması (Genel)",
    "KAR PAYI DAĞITIM İŞLEMLERİNE İLİŞKİN BİLDİRİM",
    "Sermaye Artırımı - Azaltımı İşlemlerine İlişkin Bildirim",
    "Işık  ve   ışık: İ-I ı-i",
    "​Pay Alım Satım Bildirimi‏",
)


def _reading(kind: str, base: str, row: dict[str, Any] | None = None, mine: str | None = None) -> dict[str, Any]:
    r = lines.read({"subject": "", "summary": "", "parsed": {}, **(row or {})}, kind, base, mine=mine)
    return {"line": r.line, "tone": r.tone, "so_what": r.so_what}


def _plain_lines() -> dict[str, Any]:
    insider_buy = {"parsed": {"status": "ok", "direction": "buy"}}
    insider_sell = {"parsed": {"status": "ok", "direction": "sell"}}
    return {
        "buyback": _reading("buyback", ""),
        "insider_buy": _reading("insider", "", insider_buy),
        "insider_sell": _reading("insider", "", insider_sell),
        "insider_sell_held": _reading("insider", "", insider_sell, mine="held"),
        "contract": _reading("contract", "", {"subject": "Yeni İş İlişkisi"}),
        "tender": _reading("contract", "", {"subject": "İhale Süreci / Sonucu"}),
        "earnings_unknown": _reading("earnings", "", {}),
        "capital_bedelsiz": _reading("capital", "", {"summary": "bedelsiz"}),
        "capital_bedelli": _reading("capital", "", {"summary": "bedelli"}),
        "capital_other": _reading("capital", "", {}),
        "dividend": _reading("dividend", kinds.SUBJECT_LINES[next(iter(kinds.SUBJECT_LINES))][1]),
        "merger": _reading("merger", "Birleşme işlemiyle ilgili bildirim yayımladı."),
        "restriction": _reading("restriction", "SPK bu hisse için tedbir kararı yayımladı; işlem kısıtı olabilir."),
    }


def subject_map() -> dict[str, Any]:
    return {
        "version": SUBJECT_MAP_VERSION,
        "routes": dict(sorted(_ROUTES.items())),
        "route_kinds": dict(sorted(kinds.ROUTE_KINDS.items())),
        "subject_lines": {k: list(v) for k, v in sorted(kinds.SUBJECT_LINES.items())},
        "kind_order": list(kinds.KIND_ORDER),
        "kind_titles": kinds.KIND_TITLES,
        "quarter_words": {str(k): v for k, v in kinds.QUARTER_WORDS.items()},
        "earnings_unknown_line": "Finansal tablolarını açıkladı.",
        "lines": _plain_lines(),
        "norm_vectors": [[raw, norm_key(raw)] for raw in NORM_SAMPLES],
    }


def calendar() -> dict[str, Any]:
    return {
        "first_year": bist.FIRST_YEAR,
        "last_year": bist.LAST_YEAR,
        "holidays": sorted(d.isoformat() for d in bist.HOLIDAYS),
        "half_days": sorted(d.isoformat() for d in bist.HALF_DAYS),
    }


def _slim(item: dict[str, Any]) -> dict[str, Any]:
    basic, detail = item["disclosureBasic"], item.get("disclosureDetail") or {}
    keys = ("title", "stockCode", "relatedStocks", "companyTitle", "disclosureClass", "publishDate", "disclosureIndex",
            "summary", "year", "period", "relatedDisclosureOid")  # fmt: skip
    return {
        "disclosureBasic": {k: basic.get(k) for k in keys},
        "disclosureDetail": {"relatedDisclosureIndex": detail.get("relatedDisclosureIndex")},
    }


def parity() -> dict[str, Any]:
    """Recorded KAP list rows with what the backend says about each one (the Worker must say the same)."""
    raw = json.loads(RECORDED.read_text(encoding="utf-8"))
    by_index = {int(i["disclosureBasic"]["disclosureIndex"]): i for i in raw}
    rows, _errors = normalize_rows(raw, source="backfill", seen_at=None)
    picked: list[dict[str, Any]] = []
    plain = noise = 0
    for d in rows:
        row = {"subject": d.subject, "summary": d.summary, "subject_route": d.subject_route, "is_noise": d.is_noise,
               "parsed": {}, "fin_year": d.fin_year, "fin_period": d.fin_period}  # fmt: skip
        found = kinds.classify(row) if d.reason == "NEW" and d.primary_ticker else None
        if found is None:
            if d.is_noise:
                noise += 1
                if noise > KEEP_NOISE:
                    continue
            else:
                plain += 1
                if plain > KEEP_PLAIN:
                    continue
            expected: dict[str, Any] = {"important": False}
        else:
            kind, base = found
            r = lines.read(row, kind, base, mine=None)
            expected = {"important": True, "kind": kind, "line": r.line, "tone": r.tone, "so_what": r.so_what}
        picked.append({"item": _slim(by_index[d.disclosure_index]), "index": d.disclosure_index,
                       "ticker": d.primary_ticker, "route": d.subject_route, **expected})  # fmt: skip
    return {"source": RECORDED.name, "rows": picked}


def _dump(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=1) + "\n"


def render() -> dict[Path, str]:
    """Path -> exact text of each generated file."""
    return {
        OUT_DIR / "subject_map.json": _dump(subject_map()),
        OUT_DIR / "calendar.json": _dump(calendar()),
        FIXTURE_DIR / "parity.json": _dump(parity()),
    }


def stale() -> list[Path]:
    """The files that differ from what the backend would write now."""
    return [p for p, text in render().items() if not p.exists() or p.read_text(encoding="utf-8") != text]


def main(argv: list[str]) -> int:
    if "--check" in argv:
        bad = stale()
        for path in bad:
            print(f"out of date: {path.relative_to(ROOT)}")
        return 1 if bad else 0
    for path, text in render().items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
