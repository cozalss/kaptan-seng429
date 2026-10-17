"""List rows → NormalizedDisclosure (recorded list/main + byCriteria days), subject routes, issuers."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime, timedelta

import pytest

from kaptan.ingest.normalize import (
    RowError,
    from_by_criteria,
    from_list_main,
    normalize_rows,
    split_codes,
)
from kaptan.ingest.repo import CompanyIndex, classification_for, payload_sha256
from kaptan.ingest.subject_routes import route_for, wants_detail
from tests.ingest_support import DAY_16, by_criteria, list_main

SEEN = datetime(2026, 10, 16, 20, 30, tzinfo=UTC)


def _by_index(rows: list[dict], idx: int) -> dict:  # type: ignore[type-arg]
    for r in rows:
        basic = r.get("disclosureBasic", r)
        if basic["disclosureIndex"] == idx:
            return r
    raise AssertionError(idx)


def test_a_recorded_day_normalises_completely() -> None:
    rows, errors = normalize_rows(list_main(DAY_16), source="live", seen_at=SEEN)
    assert errors == []
    assert len(rows) == 481
    assert [r.disclosure_index for r in rows] == sorted(r.disclosure_index for r in rows)
    routes = Counter(r.subject_route for r in rows)
    assert routes["noise"] == 232 and routes["E1"] == 60 and routes["E3"] == 3 and routes["E4"] == 1
    assert all(r.is_noise == (r.subject_route == "noise") for r in rows)


def test_list_main_row_fields() -> None:
    d = from_list_main(_by_index(list_main(DAY_16), 1683376), source="live", seen_at=SEEN)
    assert d.disclosure_oid and len(d.disclosure_oid) == 32
    assert d.member_oid and d.primary_ticker == "CVKMD" and d.stock_codes == ("CVKMD",)
    assert d.subject == "Payların Geri Alınmasına İlişkin Bildirim" and d.subject_route == "E1"
    assert d.published_at == datetime(2026, 10, 16, 19, 7, 9, tzinfo=UTC)  # 22:07:09 Istanbul
    assert d.first_seen_at == SEEN and d.available_at == SEEN  # seen after publication
    assert d.reason == "UPD"  # linked to the buyback decision
    assert d.has_multilang is True and d.ingest_source == "live"


def test_kap_sent_notice_takes_the_related_stock() -> None:
    d = from_list_main(_by_index(list_main(DAY_16), 1683269), source="live", seen_at=SEEN)
    assert d.disclosure_class == "DUY" and d.stock_codes == ()
    assert d.primary_ticker == "BAHKM" and d.related_stocks == ("BAHKM",)
    assert d.subject_route == "E2"


def test_multi_code_rows_keep_every_valid_code() -> None:
    assert split_codes("ISMEN, IYM") == ("ISMEN", "IYM")
    assert split_codes(["AHSGY", "RE8", "toolongcode", "ahsgy"]) == ("AHSGY", "RE8")
    assert split_codes(None) == ()


def test_backfill_rows_have_no_first_seen_and_a_60s_availability() -> None:
    row = _by_index(by_criteria(DAY_16), 1683376)
    d = from_by_criteria(row, source="backfill", seen_at=SEEN)
    assert d.first_seen_at is None and d.disclosure_oid is None and d.member_oid is None
    assert d.available_at - d.published_at == timedelta(seconds=60)
    assert d.company_name and d.primary_ticker == "CVKMD" and d.reason == "NEW"


def test_available_at_never_precedes_publication() -> None:
    row = _by_index(list_main(DAY_16), 1683376)
    early = datetime(2026, 10, 16, 18, 0, tzinfo=UTC)  # a skewed clock before publishDate
    d = from_list_main(row, source="live", seen_at=early)
    assert d.available_at == d.published_at


@pytest.mark.parametrize(
    ("patch", "message"),
    [
        ({"disclosureIndex": None}, "bad disclosureIndex"),
        ({"disclosureClass": "XYZ"}, "unknown disclosureClass"),
        ({"title": ""}, "empty subject"),
        ({"publishDate": None}, "no publishDate"),
        ({"publishDate": "yarın"}, "unrecognised"),
    ],
)
def test_bad_rows_are_reported_not_stored(patch: dict, message: str) -> None:  # type: ignore[type-arg]
    row = _by_index(list_main(DAY_16), 1683376)
    bad = {**row, "disclosureBasic": {**row["disclosureBasic"], **patch}}
    with pytest.raises(RowError, match=message):
        from_list_main(bad, source="live", seen_at=SEEN)
    rows, errors = normalize_rows([bad, row, row], source="live", seen_at=SEEN)
    assert len(rows) == 1 and len(errors) == 1
    with pytest.raises(RowError, match="disclosureBasic"):
        from_list_main({"x": 1}, source="live", seen_at=SEEN)


def test_subject_routes() -> None:
    assert route_for("Pay Bazında Devre Kesici Bildirimi") == "noise"
    assert route_for("Yeni İş İlişkisi") == "E3"
    assert route_for("İHALE SÜRECİ / SONUCU") == "E3"  # Turkish case folding, not str.lower()
    assert route_for("Özel Durum Açıklaması (Genel)") == "llm"
    assert route_for("Sermaye Piyasası Kurulu Tedbir Kararı") == "avoid:spk_tedbir"
    assert route_for("Finansal Takvim") == "archive_only"
    assert wants_detail("E4") and wants_detail("llm") and not wants_detail("noise")


def test_classification_documents() -> None:
    assert classification_for("E1") == {"event_type": "E1", "confidence": 0.98, "method": "subject_map"}
    assert classification_for("avoid:spk_tedbir") == {
        "event_type": "FILTER",
        "confidence": 1.0,
        "method": "subject_map",
    }
    assert classification_for("archive_only") == {"event_type": "IGNORE", "confidence": 1.0, "method": "subject_map"}
    assert classification_for("noise") is None and classification_for("llm") is None


def test_company_index_prefers_the_subject_company_for_kap_notices() -> None:
    notice = from_list_main(_by_index(list_main(DAY_16), 1683269), source="live", seen_at=SEEN)
    assert notice.company_name == "KAMUYU AYDINLATMA PLATFORMU"
    index = CompanyIndex(
        by_member={notice.member_oid or "": (1, "KAMUYU AYDINLATMA PLATFORMU")},
        by_ticker={"BAHKM": (3, "BAHADIR KİMYA")},
    )
    assert index.resolve(notice) == (3, "BAHADIR KİMYA", "BAHKM")
    assert CompanyIndex(by_member=index.by_member).resolve(notice) == (1, "KAMUYU AYDINLATMA PLATFORMU", "BAHKM")
    own = from_list_main(_by_index(list_main(DAY_16), 1683376), source="live", seen_at=SEEN)
    assert CompanyIndex(by_member={own.member_oid or "": (2, "CVK MADEN")}).resolve(own) == (2, "CVK MADEN", "CVKMD")
    assert CompanyIndex().resolve(own) == (None, own.company_name, "CVKMD")
    broker = from_list_main(_by_index(list_main(DAY_16), 1683334), source="live", seen_at=SEEN)
    assert broker.primary_ticker == "PIE"  # the fund manager's own member code
    assert CompanyIndex(by_ticker={"AHSGY": (4, "AHES GYO")}).resolve(broker) == (4, "AHES GYO", "AHSGY")


def test_payload_hash_ignores_key_order() -> None:
    assert payload_sha256({"a": 1, "b": "ç"}) == payload_sha256({"b": "ç", "a": 1})
