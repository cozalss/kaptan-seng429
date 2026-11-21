"""Which disclosures are notable, and what happened in one plain line (pure; no model, no guessing).

A disclosure is in the digest only when its KAP subject (or the route the ingest gave it) says what kind it is:
- the ingest routes E1 (buyback), E3 (new business, tender), E4 (financial report), avoid:spk_tedbir (SPK measure);
- E2 (insider / major-holder trade) only when the direction is known: the parsed form says buy or sell, or the
  company's own title says only "alım" or only "satım/satış". A bare "Pay Alım Satım Bildirimi" is left out;
- an exact allowlist of KAP subjects for what the routes do not name: dividend, capital change, merger / split.
Noise is never in. A disclosure that fits none of these is not in the digest: unknown means left out.
Numbers appear only when the parser read them with status "ok" (buyback price, insider price range, one amount).
"""

from __future__ import annotations

from typing import Any, Final

from kaptan.rules.format import fmt_dec, fmt_int
from kaptan.text.turkish import norm_key, tr_lower

#: Output order of the groups (and the tie-break of the home card): the warnings first, the daily buyback last.
KIND_ORDER: Final = (
    "restriction", "insider", "contract", "earnings", "dividend", "capital", "merger", "buyback",
)  # fmt: skip
KIND_TITLES: Final = {
    "restriction": "SPK tedbiri",
    "insider": "Yönetici ve ana ortak işlemleri",
    "contract": "Yeni iş ve ihale",
    "earnings": "Finansal sonuçlar",
    "dividend": "Kâr payı",
    "capital": "Sermaye artırımı ve azaltımı",
    "merger": "Birleşme ve bölünme",
    "buyback": "Kendi hissesini geri alanlar",
}
MONTHS: Final = (
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
)  # fmt: skip
ROUTE_KINDS: Final = {"E1": "buyback", "E3": "contract", "E4": "earnings", "avoid:spk_tedbir": "restriction"}
_DIVIDEND: Final = "Kâr payı dağıtımıyla ilgili bildirim yayımladı."
_CAPITAL: Final = "Sermaye artırımı ya da azaltımıyla ilgili bildirim yayımladı."
#: Exact KAP subjects (compared with `norm_key`) for what no route names → (kind, plain line).
SUBJECT_LINES: Final[dict[str, tuple[str, str]]] = {
    norm_key(subject): entry
    for subject, entry in {
        "Kar Payı Dağıtım İşlemlerine İlişkin Bildirim": ("dividend", _DIVIDEND),
        "Kar Payı Avansı Ödemesi İşlemlerine İlişkin Bildirim": (
            "dividend",
            "Kâr payı avansı ödemesiyle ilgili bildirim yayımladı.",
        ),
        "Sermaye Artırımı - Azaltımı İşlemlerine İlişkin Bildirim": ("capital", _CAPITAL),
        "Sermaye Artırımı veya Azaltımı Bildirimi": ("capital", _CAPITAL),
        "Birleşme İşlemlerine İlişkin Bildirim": ("merger", "Birleşme işlemiyle ilgili bildirim yayımladı."),
        "Bölünme İşlemlerine İlişkin Bildirim": ("merger", "Bölünme işlemiyle ilgili bildirim yayımladı."),
    }.items()
}
QUARTER_WORDS: Final = {1: "ilk çeyrek", 2: "ikinci çeyrek", 3: "üçüncü çeyrek"}
HEADLINE_MAX: Final = 140


def _num(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def day_words(iso: Any) -> str | None:
    """'2026-11-20' → '20 Kasım'; None when it is not a date."""
    try:
        _, m, d = (int(p) for p in str(iso).split("-"))
    except ValueError:
        return None
    return f"{d} {MONTHS[m - 1]}" if 1 <= m <= 12 else None


def money_words(value: Any, currency: Any) -> str | None:
    """11364379.71 'USD' → '11,36 milyon USD'; None without a number."""
    n = _num(value)
    if n is None or n <= 0 or not currency:
        return None
    unit = "₺" if currency == "TRY" else str(currency)
    if n >= 1e9:
        return f"{fmt_dec(n / 1e9)} milyar {unit}"
    if n >= 1e6:
        return f"{fmt_dec(n / 1e6)} milyon {unit}"
    return f"{fmt_int(n)} {unit}"


def _buyback(parsed: dict[str, Any]) -> str:
    latest = parsed.get("latest") if parsed.get("status") == "ok" else None
    price = _num((latest or {}).get("price_try"))
    when = day_words((latest or {}).get("date"))
    if price is None or price <= 0 or when is None:
        return "Kendi hissesini borsadan geri aldığını bildirdi."
    return f"Kendi hissesini geri aldı: son işlem {when}, hisse başı {fmt_dec(price)} ₺."


def _direction(parsed: dict[str, Any], summary: str) -> str | None:
    if parsed.get("mentions_fund"):
        return None
    if parsed.get("status") == "ok" and parsed.get("direction") in ("buy", "sell", "mixed"):
        return str(parsed["direction"])
    low = tr_lower(summary)
    buys, sells = "alım" in low, "satım" in low or "satış" in low
    if buys != sells:
        return "buy" if buys else "sell"
    return None


def _insider(parsed: dict[str, Any], summary: str) -> str | None:
    direction = _direction(parsed, summary)
    if direction is None:
        return None
    verb = {"buy": "hisse aldı", "sell": "hisse sattı", "mixed": "hem hisse aldı hem hisse sattı"}[direction]
    line = f"Şirketin yöneticisi ya da büyük ortağı {verb}."
    low, high = _num(parsed.get("price_low_try")), _num(parsed.get("price_high_try"))
    if parsed.get("status") == "ok" and low and high and low > 0 and high >= low:
        span = fmt_dec(low) if low == high else f"{fmt_dec(low)}–{fmt_dec(high)}"
        line += f" Fiyat: {span} ₺."
    return line


def _contract(subject_key: str, parsed: dict[str, Any]) -> str:
    base = "Bir ihale süreci ya da sonucu bildirdi." if "ihale" in subject_key else "Yeni bir iş ilişkisi bildirdi."
    amounts = parsed.get("amounts") if parsed.get("status") == "ok" else None
    if isinstance(amounts, list) and len(amounts) == 1 and isinstance(amounts[0], dict):
        said = money_words(amounts[0].get("value"), amounts[0].get("currency"))
        if said:
            return f"{base} Tutar: {said}."
    return base


def _earnings(row: dict[str, Any]) -> str:
    year, period = row.get("fin_year"), str(row.get("fin_period") or "")
    if not isinstance(year, int) or period not in ("1", "2", "3", "4"):
        return "Finansal tablolarını açıkladı."
    if period == "4":
        return f"{year} yıllık finansal tablolarını açıkladı."
    return f"{year} {QUARTER_WORDS[int(period)]} finansal tablolarını açıkladı."


def headline_of(summary: str) -> str | None:
    text = " ".join(summary.split())
    if not text:
        return None
    return text if len(text) <= HEADLINE_MAX else text[: HEADLINE_MAX - 1].rstrip() + "…"


def classify(row: dict[str, Any]) -> tuple[str, str] | None:
    """(kind, one plain Turkish line) of a disclosure row, or None when it is not notable. Pure.

    `row`: subject, summary, subject_route, is_noise, parsed (the slim parsed document), fin_year, fin_period.
    """
    route = str(row["subject_route"])
    if row.get("is_noise") or route == "noise":
        return None
    parsed: dict[str, Any] = row.get("parsed") or {}
    key = norm_key(str(row["subject"]))
    if route == "E2":
        line = _insider(parsed, str(row.get("summary") or ""))
        return None if line is None else ("insider", line)
    kind = ROUTE_KINDS.get(route)
    if kind == "buyback":
        return kind, _buyback(parsed)
    if kind == "contract":
        return kind, _contract(key, parsed)
    if kind == "earnings":
        return kind, _earnings(row)
    if kind == "restriction":
        return kind, "SPK bu hisse için tedbir kararı yayımladı; işlem kısıtı olabilir."
    return SUBJECT_LINES.get(key)
