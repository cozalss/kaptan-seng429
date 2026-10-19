"""Restriction notices → measures / lifts (offline)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from kaptan.prices.calendar import IST
from kaptan.reference.tedbir_parse import parse_bulletin_text, parse_notice

AT = datetime(2026, 10, 19, 19, 30, tzinfo=IST)


def _row(subject: str, summary: str | None, *, route: str = "archive_only", codes: list[str] | None = None) -> Any:
    return {
        "disclosure_index": 1684999,
        "subject": subject,
        "summary": summary,
        "subject_route": route,
        "primary_ticker": None,
        "stock_codes": [],
        "related_stocks": ["TSTAA"] if codes is None else codes,
        "available_at": AT,
    }


def test_spk_tedbir_open_ended_unless_dated() -> None:
    p = parse_notice(_row("Sermaye Piyasası Kurulu Tedbir Kararı", None, route="avoid:spk_tedbir"))
    (m,) = p.measures
    assert (m.kind, m.ticker, m.start_date, m.end_date, m.expires_at) == ("spk_tedbir", "TSTAA", AT.date(), None, None)
    text = "Paylarda 20.10.2026 tarihinden itibaren 6 ay süreyle tedbir uygulanmasına karar verilmiştir."
    (m2,) = parse_notice(_row("Sermaye Piyasası Kurulu Tedbir Kararı", None, route="avoid:spk_tedbir"), text).measures
    assert (m2.start_date, m2.end_date) == (date(2026, 10, 20), date(2027, 4, 19))
    assert m2.expires_at == datetime(2027, 4, 20, tzinfo=IST)


def test_vbts_kinds_ranges_and_default() -> None:
    p = parse_notice(_row("Borsa İstanbul Duyurusu", "VBTS kapsamında BRÜT TAKAS ve açığa satış tedbiri"))
    assert {m.kind for m in p.measures} == {"vbts_brut_takas", "vbts_aciga_satis"}
    assert all(m.end_date == date(2026, 11, 18) for m in p.measures)  # default one month
    ranged = parse_notice(_row("Borsa İstanbul Duyurusu", "Tek fiyat tedbiri 20.10.2026 - 16.11.2026"))
    (m,) = ranged.measures
    assert (m.kind, m.start_date, m.end_date, m.detail["period"]) == (
        "vbts_tek_fiyat",
        date(2026, 10, 20),
        date(2026, 11, 16),
        "range",
    )
    inferred = parse_notice(_row("VBTS Duyurusu", "Volatilite bazlı tedbir"))
    assert inferred.measures[0].kind == "vbts_brut_takas" and inferred.measures[0].detail["kind_inferred"]
    sessions = parse_notice(_row("Borsa İstanbul Duyurusu", "kredili işlem yasağı 5 işlem günü süreyle"))
    assert sessions.measures[0].end_date is not None and sessions.measures[0].end_date > AT.date()


def test_halts_lifts_noise_and_no_codes() -> None:
    halt = parse_notice(_row("İşlem Sırasının Durdurulması", None))
    assert halt.measures[0].kind == "trading_halt" and halt.measures[0].end_date is None
    lift = parse_notice(_row("İşlem Sırasının Açılması", None))
    assert lift.lifts[0].kinds == ("trading_halt",) and not lift.measures
    vb_lift = parse_notice(_row("Borsa İstanbul Duyurusu", "Brüt takas tedbirinin kaldırılması"))
    assert vb_lift.lifts[0].kinds == ("vbts_brut_takas",)
    assert not parse_notice(_row("Pay Bazında Devre Kesici Bildirimi", "durduruldu")).measures
    assert not parse_notice(_row("Genel Kurul", "toplantı")).measures
    assert not parse_notice(_row("Sermaye Piyasası Kurulu Tedbir Kararı", None, codes=[])).measures


def test_bulletin_sentences() -> None:
    text = "X A.Ş. (TSTBB) paylarında 3 ay süreyle tedbir uygulanmıştır. Y A.Ş. (TSTCC) genel kurul yaptı."
    (m,) = parse_bulletin_text(text, AT - timedelta(days=1), "2026-45")
    assert (m.ticker, m.kind, m.source, m.end_date) == ("TSTBB", "spk_tedbir", "spk_bulletin", date(2027, 1, 17))
