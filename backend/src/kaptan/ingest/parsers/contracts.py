"""E3 — "Yeni İş İlişkisi" (new business) and "İhale Süreci / Sonucu" (tenders).

Both are fixed forms followed by a free-text "Açıklamalar" block. Amounts are read from the form
first (tender: "İhale Bedeli"), then from the explanation ("63.576.313 TL", "10.077.560 EUR"); every
amount with its currency is kept so the Reader / E3 rule can convert at the decision date's TCMB rate.
Binding-ness (signed vs. first-ranked vs. finalised) stays with the Reader; we only surface the cues.
"""

from __future__ import annotations

import re
from typing import Any, Final

from kaptan.ingest.parsers.common import NUMBER, flags, form_fields, money, numbers, parse_date, section
from kaptan.text.turkish import tr_lower

NEW_BUSINESS_LABELS: Final = (
    "Yeni İş İlişkisine Başlanan/Başlanacak Kişinin Niteliği",
    "Müşterinin/Tedarikçinin Adı Soyadı/Ticaret Ünvanı",
    "Varsa Müşterinin/Tedarikçinin Ortaklığın Kamuya Açıklanan Son Gelir Tablosundaki Net Satışlar/Satılan Mal "
    "Maliyeti İçindeki Payı",
    "Varsa Müşterinin/Tedarikçinin Ortaklığın Kamuya Açıklanan Son Bilançosundaki Ticari Alacaklar/Borçlar İçindeki "
    "Payı",
    "İş İlişkisinin Başlamasının Öngörüldüğü Tarih",
    "Varsa Sözleşmenin Önemli Koşulları",
    "Yeni İş İlişkisinin Ortaklık Faaliyetlerine Etkisi",
    "Açıklamalar",
)

TENDER_LABELS: Final = (
    "İhale Konusu",
    "İhaleyi Açan Taraf",
    "İhaleye Teklif Verilmesine İlişkin Yönetim Kurulu Kararı",
    "Grup Olarak İhaleye Girilmesi Halinde Diğer Taraflar",
    "Grup Olarak İhaleye Girilmesi Halinde Ortaklığın Payı",
    "İhaleye Teklif Verme Tarihi",
    "İhalenin Sonuçlandığı Tarih",
    "İhale Sonucu",
    "İhale Bedeli",
    "İhale Bedelinden Ortaklık Payına Düşen Kısım",
    "Ortaklık Payına Düşen Kısmın Kamuya Açıklanan Son Gelir Tablosundaki Brüt Satış Hasılatına Oranı (%)",
    "Açıklamalar",
)

_CURRENCY: Final = r"(TL|TRY|EUR|Euro|Avro|USD|ABD\s*Doları|Dolar|GBP|Sterlin)"
_AMOUNT: Final = re.compile(rf"({NUMBER})\s*(milyar|milyon|bin)?\s*{_CURRENCY}(?![a-zçğıöşü])", re.I)
_CODES: Final = {
    "tl": "TRY",
    "try": "TRY",
    "eur": "EUR",
    "euro": "EUR",
    "avro": "EUR",
    "usd": "USD",
    "abd doları": "USD",
    "dolar": "USD",
    "gbp": "GBP",
    "sterlin": "GBP",
}
_END: Final = ("Yukarıdaki açıklamalarımızın", "Çekince:", "Kamuoyunun bilgi", "Kamuoyu ve yatırımcı")
_BINDING_CUES: Final = {
    "signed": ("sözleşme imzalan", "sözleşmesi imzalan", "imzalanmıştır"),
    "order_received": ("sipariş al", "siparişi al"),
    "ranked_first": ("1. olunmuştur", "1. olmuştur", "en avantajlı teklif", "ekonomik açıdan en avantajlı"),
    "finalised": ("kesinleşen ihale kararı", "kesinleşmiştir", "uhdesinde kalmıştır", "ihale kararı tebliğ"),
    "cancelled": ("iptal edil",),
}


def amounts(text: str) -> list[dict[str, Any]]:
    """Every '<number> [milyon] <currency>' in reading order, de-duplicated."""
    out: list[dict[str, Any]] = []
    for m in _AMOUNT.finditer(text):
        found = numbers(f"{m.group(1)} {m.group(2) or ''}".strip())
        if not found:
            continue
        value = found[0]
        if m.group(2):
            value = value * {"milyar": 10**9, "milyon": 10**6, "bin": 10**3}[tr_lower(m.group(2))]
        currency = _CODES.get(re.sub(r"\s+", " ", tr_lower(m.group(3))), "TRY")
        item = {"value": value, "currency": currency}
        if item not in out:
            out.append(item)
    return out


def cues(text: str) -> list[str]:
    low = tr_lower(re.sub(r"\s+", " ", text))
    return [name for name, needles in _BINDING_CUES.items() if any(n in low for n in needles)]


def parse_new_business(text: str) -> dict[str, Any]:
    f = form_fields(text, NEW_BUSINESS_LABELS, after="Bildirim İçeriği")
    explanation = section(text, "Açıklamalar", *_END)
    found = amounts(explanation)
    return {
        "kind": "new_business",
        **flags(text),
        "counterparty_role": f["Yeni İş İlişkisine Başlanan/Başlanacak Kişinin Niteliği"],
        "counterparty": f["Müşterinin/Tedarikçinin Adı Soyadı/Ticaret Ünvanı"],
        "start_date": parse_date(f["İş İlişkisinin Başlamasının Öngörüldüğü Tarih"]),
        "key_terms": f["Varsa Sözleşmenin Önemli Koşulları"],
        "expected_effect": f["Yeni İş İlişkisinin Ortaklık Faaliyetlerine Etkisi"],
        "amounts": found,
        "amount_try": next((a["value"] for a in found if a["currency"] == "TRY"), None),
        "cues": cues(explanation),
        "status": "ok" if found else "partial",
    }


def parse_tender(text: str) -> dict[str, Any]:
    f = form_fields(text, TENDER_LABELS, after="Bildirim İçeriği")
    explanation = section(text, "Açıklamalar", *_END)
    price_field = f["İhale Bedeli"]
    form_amounts = amounts(price_field or "")
    found = form_amounts or amounts(explanation)
    return {
        "kind": "tender",
        **flags(text),
        "subject": f["İhale Konusu"],
        "awarding_party": f["İhaleyi Açan Taraf"],
        "bid_date": parse_date(f["İhaleye Teklif Verme Tarihi"]),
        "result_date": parse_date(f["İhalenin Sonuçlandığı Tarih"]),
        "result": f["İhale Sonucu"],
        "group_share": f["Grup Olarak İhaleye Girilmesi Halinde Ortaklığın Payı"],
        "company_share_amount": money(f["İhale Bedelinden Ortaklık Payına Düşen Kısım"]),
        "amounts": found,
        "amount_try": next((a["value"] for a in found if a["currency"] == "TRY"), money(price_field)),
        "cues": cues(f"{f['İhale Sonucu'] or ''} {explanation}"),
        "status": "ok" if found or money(price_field) else "partial",
    }
