"""The one plain line, its tone and its "so what" for an important disclosure (pure; rules only).

`read(row, kind, ...)` builds them from the parsed fields of each kind. A number appears only when the parser read it
with status "ok" and the disclosure says it. `thin` is true when the rules cannot say much more than the KAP subject
did (earnings without a figure, a merger, a bare dividend notice, a contract without an amount): that is where an
optional model call may write a better line (`kaptan.signal.llm`).
Lines name no company (the company travels beside the line) and never the person's money.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Final, Literal, get_args

from kaptan.digest.kinds import HEADLINE_MAX, QUARTER_WORDS, day_words, money_words
from kaptan.rules.format import fmt_dec, fmt_int
from kaptan.text.turkish import tr_lower

Tone = Literal["olumlu", "olumsuz", "notr", "belirsiz"]
TONES: Final = frozenset(get_args(Tone))
LINE_MAX: Final = 140


@dataclass(frozen=True, slots=True)
class Reading:
    line: str
    tone: Tone
    so_what: str | None
    thin: bool = False


def _num(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def clip(text: str, limit: int = LINE_MAX) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _buyback(parsed: dict[str, Any]) -> Reading:
    so_what = "Şirket kendi hissesini alıyor; bu genelde fiyatı destekler. Yapman gereken bir şey yok."
    latest = parsed.get("latest") if parsed.get("status") == "ok" else None
    latest = latest or {}
    price, qty = _num(latest.get("price_try")), _num(latest.get("nominal_try"))
    when = day_words(latest.get("date"))
    if price is None or price <= 0 or when is None:
        return Reading("Kendi hissesini geri alacağını ya da aldığını bildirdi; tutar okunamadı.", "olumlu", so_what)
    amount = f"{fmt_int(qty)} adet " if qty is not None and qty > 0 else ""
    return Reading(f"Kendi hissesinden {when} günü {amount}aldı, hisse başı {fmt_dec(price)} ₺.", "olumlu", so_what)


def _insider(parsed: dict[str, Any], direction: str, mine: str | None) -> Reading:
    low, high = _num(parsed.get("price_low_try")), _num(parsed.get("price_high_try"))
    price = ""
    if parsed.get("status") == "ok" and low and high and low > 0 and high >= low:
        price = f" Fiyat: {fmt_dec(low) if low == high else f'{fmt_dec(low)}–{fmt_dec(high)}'} ₺."
    if direction == "buy":
        return Reading(
            f"Yönetici ya da büyük ortak hisse aldı.{price}", "olumlu",
            "İçeriden alım genelde şirkete güvenin işareti sayılır; tek başına karar için yetmez.",
        )  # fmt: skip
    if direction == "sell":
        who = "Elindeki hisse için" if mine == "held" else "Bu şirket için"
        return Reading(
            f"Yönetici ya da büyük ortak hisse sattı.{price}", "olumsuz",
            f"{who} dikkat işareti; neden sattığı duyuruda yazıyor olabilir, bir bak.",
        )  # fmt: skip
    return Reading(f"Yönetici ya da büyük ortak hem aldı hem sattı.{price}", "notr", None)


def _contract(subject_key: str, parsed: dict[str, Any], revenue_try: float | None) -> Reading:
    base = "Bir ihale süreci ya da sonucu bildirdi." if "ihale" in subject_key else "Yeni bir iş anlaşması bildirdi."
    amounts = parsed.get("amounts") if parsed.get("status") == "ok" else None
    if isinstance(amounts, list) and len(amounts) == 1 and isinstance(amounts[0], dict):
        value, cur = _num(amounts[0].get("value")), amounts[0].get("currency")
        said = money_words(value, cur)
        if said and value is not None:
            if cur == "TRY" and revenue_try and revenue_try > 0:
                share = value / revenue_try * 100
                size = f" Şirketin yıllık cirosunun yaklaşık %{fmt_dec(share, 1)}'i." if share >= 0.1 else ""
                return Reading(
                    clip(f"{base[:-1]}: {said}.{size}"), "olumlu",
                    "Ciroya göre küçük bir iş fiyatı pek oynatmaz; büyükse ilgi çekebilir." if size else None,
                )  # fmt: skip
            return Reading(clip(f"{base[:-1]}: {said}."), "olumlu", None)
    return Reading(base, "belirsiz", None, thin=True)


def _earnings(row: dict[str, Any]) -> Reading:
    year, period = row.get("fin_year"), str(row.get("fin_period") or "")
    if not isinstance(year, int) or period not in ("1", "2", "3", "4"):
        return Reading("Finansal tablolarını açıkladı.", "belirsiz", None, thin=True)
    words = "yıllık" if period == "4" else QUARTER_WORDS[int(period)]
    return Reading(f"{year} {words} finansal tablolarını açıkladı.", "belirsiz", None, thin=True)


def _capital(summary: str, subject: str) -> Reading:
    low = tr_lower(f"{summary} {subject}")
    if "bedelsiz" in low:
        return Reading(
            "Bedelsiz sermaye artırımı bildirdi: elindeki hisse sayısı artar, toplam değer aynı kalır.",
            "notr", "Hisse sayın artar ama şirketin değeri değişmez; fiyat buna göre düşer.",
        )  # fmt: skip
    if "bedelli" in low:
        return Reading(
            "Bedelli sermaye artırımı bildirdi: yeni pay almak için para yatırmak gerekir.",
            "notr", "Pay almak istersen para yatırman gerekir; almazsan payın oranı küçülür.",
        )  # fmt: skip
    return Reading("Sermaye artırımı ya da azaltımıyla ilgili bildirim yayımladı.", "belirsiz", None, thin=True)


def read(
    row: dict[str, Any], kind: str, base_line: str, *, mine: str | None, revenue_try: float | None = None
) -> Reading:
    """The reading of one important disclosure. `base_line` is the digest's own line (the fallback)."""
    parsed: dict[str, Any] = row.get("parsed") or {}
    subject_key = tr_lower(str(row.get("subject") or ""))
    if kind == "buyback":
        return _buyback(parsed)
    if kind == "insider":
        direction = parsed.get("direction") if parsed.get("status") == "ok" else None
        if direction not in ("buy", "sell", "mixed"):
            direction = "buy" if "hisse aldı" in base_line else "sell" if "hisse sattı" in base_line else "mixed"
        return _insider(parsed, str(direction), mine)
    if kind == "contract":
        return _contract(subject_key, parsed, revenue_try)
    if kind == "earnings":
        return _earnings(row)
    if kind == "capital":
        return _capital(str(row.get("summary") or ""), subject_key)
    if kind == "dividend":
        return Reading(
            clip(base_line), "olumlu",
            "Kâr payı, şirketin kazancını ortaklarıyla paylaşmasıdır; tutarı ve tarihi duyuruda.", thin=True,
        )  # fmt: skip
    if kind == "merger":
        return Reading(clip(base_line), "belirsiz", None, thin=True)
    if kind == "restriction":
        return Reading(
            clip(base_line), "olumsuz",
            "İşlem kısıtı olabilir; alıp satmadan önce duyuruya bak.",
        )  # fmt: skip
    return Reading(clip(base_line), "belirsiz", None, thin=True)


def fallback(subject: str) -> Reading:
    """What a failed or quota-less model leaves: the KAP subject itself, tone unknown."""
    return Reading(clip(subject or "Yeni bir bildirim yayımladı.", HEADLINE_MAX), "belirsiz", None)
