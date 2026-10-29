"""The official SPK texts shipped in data/regulation/ parse and chunk (07 §11.3, FR-12), no DB, no embedding."""

from __future__ import annotations

from datetime import date

import pytest

from kaptan.rag.bases import MAX_PARAGRAPH_CHARS, REGULATION_DIR, BaseDoc, load_regulation_docs

EXPECTED: dict[str, tuple[date, int]] = {
    # doc_ref → (valid_from, number of articles incl. GEÇİCİ MADDE)
    "spk:II-22.1": (date(2014, 1, 3), 25),  # RG 3/1/2014-28871, in force on publication (md.23); 24 + geçici 1
    "spk:II-15.1": (date(2014, 2, 23), 34),  # RG 23/1/2014-28891, in force one month later (md.30); 31 + geçici 3
}


@pytest.fixture(scope="module")
def docs() -> dict[str, BaseDoc]:
    return {d.doc_ref: d for d in load_regulation_docs()}


def test_only_the_official_texts_are_shipped(docs: dict[str, BaseDoc]) -> None:
    assert set(docs) == set(EXPECTED)
    assert not list(REGULATION_DIR.glob("sample*.md"))


@pytest.mark.parametrize("ref", sorted(EXPECTED))
def test_official_text_front_matter_and_chunks(docs: dict[str, BaseDoc], ref: str) -> None:
    doc = docs[ref]
    valid_from, articles = EXPECTED[ref]
    assert doc.published_at.date() == valid_from == doc.available_at.date()
    assert doc.valid_to is None  # both communiqués are in force
    assert doc.metadata["sample"] is False
    assert doc.lang == "tr"
    # one chunk per fıkra, every chunk carries the doc tag and its article, none is cut by the loader
    assert len(doc.chunks) > articles
    assert all(c.startswith(f"[{ref} | ") for c in doc.chunks)
    assert all(c.split("] ", 1)[1].startswith(("MADDE ", "GEÇİCİ MADDE ")) for c in doc.chunks)
    assert all(len(c) < MAX_PARAGRAPH_CHARS for c in doc.chunks)
    numbered = {c.split("] ", 1)[1].split(" (", 1)[0].split(" –", 1)[0] for c in doc.chunks}
    assert len(numbered) == articles
    assert not any(c.endswith("–") for c in doc.chunks)  # no empty article stubs


def test_key_provisions_are_retrievable_text(docs: dict[str, BaseDoc]) -> None:
    buyback, special = docs["spk:II-22.1"], docs["spk:II-15.1"]
    # II-22.1 md.9/1: the 10 % ceiling of repurchased shares
    assert any(c.split("] ", 1)[1].startswith("MADDE 9 ") and "yüzde onunu aşamaz" in c for c in buyback.chunks)
    # II-15.1 md.12/4 as amended by RG-17/11/2018-30598 (MKK discloses the direct thresholds)
    md12 = [c for c in special.chunks if c.split("] ", 1)[1].startswith("MADDE 12 ")]
    assert any("30598" in c and "MKK tarafından yapılır" in c for c in md12)
