"""kaptan.rag.chunking: Turkish-aware chunks of KAP texts (07 §11.1), on the recorded fixtures."""

from __future__ import annotations

import itertools
from datetime import UTC, datetime

from kaptan.rag.chunking import (
    DocMeta,
    chunk_text,
    clean_body,
    est_tokens,
    header,
    query_text,
    split_sentences,
    summary_chunk,
    units,
)
from kaptan.rag.config import ChunkingSpec, default_rag_config, load_rag_config
from tests.ingest_support import detail_text

META = DocMeta(1683372, "AZTEK", datetime(2026, 10, 16, 18, 53, tzinfo=UTC), "Payların Geri Alınması", "ODA")
SPEC = default_rag_config().chunking


def test_config_file_is_valid_and_pins_the_vector_size() -> None:
    cfg = load_rag_config()
    assert cfg.embedding.model == "gemini-embedding-001"
    assert cfg.embedding.dim == 1024
    assert cfg.hybrid.rrf_k == 60


def test_header_uses_the_istanbul_date_and_the_kap_reference() -> None:
    late = DocMeta(1, None, datetime(2026, 10, 16, 22, 30, tzinfo=UTC), "Finansal Rapor", "FR")
    assert header(late) == "[- | 2026-10-17 | Finansal Rapor | FR | kap:1]"
    assert header(META).startswith("[AZTEK | 2026-10-16 | Payların Geri Alınması | ODA | kap:1683372]")


def test_boilerplate_lines_are_dropped() -> None:
    lines = clean_body(detail_text(1683372))
    joined = "\n".join(lines)
    assert "KAMUYU AYDINLATMA PLATFORMU" not in joined
    assert "https://www.kap.org.tr" not in joined
    assert not any(line.startswith("KAP'ta yayınlanma tarihi") for line in lines)
    assert not any(line.startswith("Yapılan Açıklama Güncelleme mi") for line in lines)
    assert "AZTEK TEKNOLOJİ ÜRÜNLERİ TİCARET A.Ş." in lines


def test_a_short_text_is_one_chunk_with_the_header() -> None:
    chunks = chunk_text(META, detail_text(1683372), SPEC)
    assert len(chunks) == 1
    assert chunks[0].chunk_no == 0
    assert chunks[0].content.startswith(header(META) + "\n")
    assert chunks[0].token_count == est_tokens(chunks[0].content)


def test_a_long_financial_report_is_split_within_the_budget_with_overlap() -> None:
    chunks = chunk_text(META, detail_text(1683354), SPEC)
    assert len(chunks) > 5
    assert [c.chunk_no for c in chunks] == list(range(len(chunks)))
    assert all(c.token_count <= SPEC.max_tokens for c in chunks)
    bodies = [c.content.split("\n")[1:] for c in chunks]
    overlaps = sum(1 for a, b in itertools.pairwise(bodies) if a[-1] == b[0])
    assert overlaps > 0  # short last units are repeated at the start of the next chunk


def test_only_boilerplate_gives_no_chunk() -> None:
    assert chunk_text(META, "KAMUYU AYDINLATMA PLATFORMU\nÖzet Bilgi\nhttps://www.kap.org.tr/tr/Bildirim/1", SPEC) == []


def test_sentences_do_not_end_at_turkish_abbreviations_or_numbers() -> None:
    text = (
        "ABC Holding A.Ş. ile Ltd. Şti. arasında 1.234.567,89 TL tutarlı sözleşme imzalanmıştır. "
        "Teslim tarihi 16.10.2026 olup vb. masraflar dahildir. Dr. Ayşe Kaya açıklama yaptı! Yeni cümle."
    )
    assert split_sentences(text) == [
        "ABC Holding A.Ş. ile Ltd. Şti. arasında 1.234.567,89 TL tutarlı sözleşme imzalanmıştır.",
        "Teslim tarihi 16.10.2026 olup vb. masraflar dahildir.",
        "Dr. Ayşe Kaya açıklama yaptı!",
        "Yeni cümle.",
    ]


def test_long_units_fall_back_to_sentences_then_words() -> None:
    sentence = "Şirketimiz yeni bir sözleşme imzalamıştır. " * 40
    parts = units([sentence.strip()], max_tokens=60)
    assert len(parts) > 1 and all(est_tokens(p) <= 60 for p in parts)
    no_stop = " ".join(["kelime"] * 400)
    words = units([no_stop], max_tokens=50)
    assert len(words) > 1 and all(est_tokens(p) <= 50 for p in words)


def test_packing_respects_a_tight_spec() -> None:
    spec = ChunkingSpec(single_max_tokens=20, target_tokens=30, max_tokens=60, overlap_max_tokens=20)
    text = "\n".join(f"Satır {i}: tutar {i * 1000} TL olarak gerçekleşmiştir." for i in range(30))
    chunks = chunk_text(META, text, spec)
    assert len(chunks) > 3
    assert all(c.token_count <= 60 + est_tokens(header(META)) for c in chunks)


def test_summary_chunk_and_query_text() -> None:
    one = summary_chunk(META, "  Pay Geri Alım\nİşlemleri ")
    assert one is not None and one.content == f"{header(META)}\nPay Geri Alım İşlemleri"
    assert summary_chunk(META, "  ") is None
    q = query_text("Konu", "Özet", detail_text(1683372), 200)
    assert q.startswith("Konu\nÖzet\n") and len(q) <= 200
    assert "KAMUYU AYDINLATMA" not in q
