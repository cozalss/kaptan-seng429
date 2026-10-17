"""KAP `subject` → route (05 `route` node, subject_map.v1). ~90 % of events are typed without an LLM."""

from __future__ import annotations

from typing import Final

TABLE_VERSION: Final = "subject_map.v1"

#: subject → (route, sub_type hint). "llm" = the Classifier reads the text.
SUBJECT_MAP: Final[dict[str, tuple[str, str]]] = {
    "Payların Geri Alınmasına İlişkin Bildirim": ("E1", "buyback_execution"),
    "Pay Geri Alımına İlişkin Bildirim": ("E1", "buyback_execution"),
    "Geri Alınan Paylara İlişkin Bildirim": ("E1", "buyback_execution"),
    "Pay Alım Satım Bildirimi": ("E2", "insider_or_major_holder_trade"),
    "Yeni İş İlişkisi": ("E3", "contract_signed"),
    "İhale Süreci / Sonucu": ("E3", "tender_award_final"),
    "Finansal Rapor": ("E4", "financial_results"),
    "Özel Durum Açıklaması (Genel)": ("llm", "other"),
    "Haber ve Söylentilere İlişkin Açıklama": ("llm", "other"),
}


def route_of(subject: str) -> tuple[str, str]:
    """Unknown subjects go to the Classifier too (never silently dropped)."""
    return SUBJECT_MAP.get(subject.strip(), ("llm", "other"))
