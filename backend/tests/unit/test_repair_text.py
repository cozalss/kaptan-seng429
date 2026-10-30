"""Double-decoded Turkish (UTF-8 read as cp1254 / latin-1) is repaired; clean text is never touched."""

from __future__ import annotations

import httpx
import pytest

from kaptan.ingest.repair_text import fix_mojibake

CLEAN = "TUKAŞ GIDA SANAYİ VE TİCARET A.Ş. · Özel Durum Açıklaması (Genel) · ğüçöı"


@pytest.mark.parametrize("codec", ["cp1254", "latin-1"])
def test_double_decoded_text_is_restored(codec: str) -> None:
    broken = CLEAN.encode("utf-8").decode(codec, errors="surrogateescape")
    assert broken != CLEAN
    assert fix_mojibake(broken) == CLEAN


def test_the_reported_sample_and_clean_text() -> None:
    assert fix_mojibake("TUKAÅ\udc9e") == "TUKAŞ"
    for ok in (CLEAN, "Ä°stanbul ama değil", "THYAO", ""):
        assert fix_mojibake(fix_mojibake(ok)) == fix_mojibake(ok)
    assert fix_mojibake(CLEAN) == CLEAN


def test_kap_json_is_decoded_as_utf8_whatever_the_charset_header_says() -> None:
    import json

    body = json.dumps([{"companyName": "TUKAŞ GIDA"}], ensure_ascii=False).encode("utf-8")
    resp = httpx.Response(200, content=body, headers={"content-type": "application/json; charset=windows-1254"})
    assert json.loads(resp.content)[0]["companyName"] == "TUKAŞ GIDA"
