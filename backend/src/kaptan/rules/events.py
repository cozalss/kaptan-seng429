"""E1–E4 trigger rules (06 §3) as trace rows. Pure: a rule reads `RuleInput` and returns a `Check`.

Each event type is an ordered tuple of rules; the engine stops at the first failing one, so the
trace reads like the analyst would argue it ("tutar eşik üstünde → bağlayıcı değil: işlem yok").
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Final

from kaptan.rules.format import fmt_dec, fmt_pct, fmt_signed_pct, fmt_try
from kaptan.rules.params import BINDING_STATUSES, E2_ROLES, RuleParams


@dataclass(frozen=True, slots=True)
class RuleInput:
    """What the merge node, the reader and the skeptic hand to the rule engine (05 §5.1)."""

    event_type: str  # E1 | E2 | E3 | E4 | IGNORE
    ticker: str
    # agent health (05 §2.5)
    agent_status: tuple[tuple[str, str], ...] = ()
    classifier_confidence: float | None = None
    reader_confidence: float | None = None
    materiality_confidence: float | None = None
    # skeptic (05 §4.5)
    skeptic_ran: bool = True
    skeptic_veto: bool = False
    skeptic_veto_supported: bool = True
    skeptic_confidence: float | None = None
    avoid_listed: bool = False
    any_injection_flag: bool = False
    # E1
    e1_nature: str | None = None
    buyback_10d_capital_pct: float | None = None
    buyback_10d_notice_count: int | None = None
    buyback_sale_within_20d: bool | None = None
    # E2
    insider_role: str | None = None
    insider_open_market: bool | None = None
    insider_net_buy_value_try: float | None = None
    # E3
    materiality_ratio: float | None = None
    materiality_denominator: str | None = None  # annual_revenue | market_cap
    binding_status: str | None = None
    related_party: bool | None = None
    renewal: bool | None = None
    reader_amount_try: float | None = None
    amount_in_text: bool | None = None
    # E4
    e4_sue: float | None = None
    e4_cfo_quality: float | str | None = None
    ret_10d: float | None = None
    # common
    leakage_5d: float | None = None
    expected_edge_bps: float | None = None
    est_cost_bps: float | None = None
    evidence_n: int | None = None
    evidence_card_id: str | None = None


@dataclass(frozen=True, slots=True)
class Check:
    rule: str
    passed: bool
    observed: str | None
    threshold: str | None
    detail_tr: str


Rule = Callable[[RuleInput, RuleParams], Check]

BINDING_LABELS: Final = {
    "signed_contract": "imzalı sözleşme",
    "order_received": "kesin sipariş",
    "tender_award_final": "kesinleşmiş ihale",
    "tender_award_not_final": "kesinleşmemiş ihale",
    "lowest_or_best_bid_only": "en avantajlı teklif",
    "framework_agreement": "çerçeve anlaşma",
    "mou_or_loi": "niyet mektubu",
    "unknown": "belirsiz",
}

ROLE_LABELS: Final = {
    "board_member": "YK üyesi",
    "executive": "yönetici",
    "controlling_shareholder": "ana ortak",
    "related_person_of_insider": "yakından ilişkili kişi",
    "investment_fund": "yatırım fonu",
    "other_5pct_holder": "%5 pay sahibi",
    "unknown": "belirsiz",
}


# ── E1: buyback executions ───────────────────────────────────────────────
def e1_capital_10d(x: RuleInput, p: RuleParams) -> Check:
    pct = x.buyback_10d_capital_pct or 0.0
    clustered = (x.buyback_10d_notice_count or 0) >= p.e1_cluster_notices_min and pct >= p.e1_capital_10d_cluster_min
    ok = pct >= p.e1_capital_10d_min or clustered
    observed = fmt_pct(pct, 2)
    detail = f"Son 10 seansta sermayenin {observed}'i geri alındı." if ok else "Geri alım oranı eşik altında."
    return Check("E1.capital_10d", ok, observed, f"≥ {fmt_pct(p.e1_capital_10d_min, 2)}", detail)


def e1_execution(x: RuleInput, p: RuleParams) -> Check:
    ok = x.e1_nature == "execution"
    observed = "gerçekleşen alım" if ok else "program duyurusu"
    detail = "Gerçekleşen alım bildirimi." if ok else "Duyuru E1 değildir; yalnızca gerçekleşen alım sayılır."
    return Check("E1.execution", ok, observed, "duyuru değil" if ok else "gerçekleşen alım", detail)


def e1_no_recent_sale(x: RuleInput, p: RuleParams) -> Check:
    ok = not x.buyback_sale_within_20d
    detail = "Son 20 seansta geri alınan pay satışı yok." if ok else "Son 20 seansta geri alınan pay satıldı."
    return Check("E1.no_recent_sale", ok, "satış yok" if ok else "satış var", "20 seansta satış yok", detail)


# ── E2: insider / controlling shareholder buys ───────────────────────────
def e2_open_market(x: RuleInput, p: RuleParams) -> Check:
    ok = bool(x.insider_open_market)
    detail = "Alım borsada yapılmış." if ok else "Alım borsa dışında: E2 değildir."
    return Check("E2.open_market", ok, "borsada alım" if ok else "borsa dışı", "piyasadan", detail)


def e2_insider_role(x: RuleInput, p: RuleParams) -> Check:
    role = x.insider_role or "unknown"
    ok = role in E2_ROLES
    label = ROLE_LABELS.get(role, role)
    if ok:
        detail = f"Alıcı {'yönetim kurulu üyesi' if role == 'board_member' else label}."
    elif role == "investment_fund":
        detail = "Fonların eşik bildirimleri E2 değildir."
    else:
        detail = "Alıcı yönetici, YK üyesi veya ana ortak değil."
    return Check("E2.insider_role", ok, label, "yönetici / ana ortak", detail)


def e2_min_value(x: RuleInput, p: RuleParams) -> Check:
    value = x.insider_net_buy_value_try or 0.0
    ok = value >= p.e2_min_value_try
    detail = "Net alım tutarı eşik üstünde." if ok else "Net alım tutarı eşik altında."
    return Check("E2.min_value", ok, fmt_try(value), f"≥ {fmt_try(p.e2_min_value_try)}", detail)


# ── E3: new business ─────────────────────────────────────────────────────
def e3_materiality(x: RuleInput, p: RuleParams) -> Check:
    ratio = x.materiality_ratio or 0.0
    by_mcap = x.materiality_denominator == "market_cap"
    floor = p.e3_mcap_materiality_min if by_mcap else p.e3_revenue_materiality_min
    base = "piyasa değeri" if by_mcap else "yıllık gelir"
    ok = ratio >= floor
    observed = fmt_pct(ratio, 1)
    if ok:
        detail = (
            f"Tutar piyasa değerinin {observed}'i."
            if by_mcap
            else f"Yıllıklandırılmış tutar yıllık gelirin {observed}'i."
        )
    else:
        detail = "Yıllıklandırılmış tutar eşik altında."
    return Check("E3.materiality", ok, observed, f"≥ {fmt_pct(floor, 1)} {base}", detail)


def e3_binding(x: RuleInput, p: RuleParams) -> Check:
    status = x.binding_status or "unknown"
    ok = status in BINDING_STATUSES
    detail = "Sözleşme bağlayıcı." if ok else "Bağlayıcı değil: işlem yok."
    return Check("E3.binding", ok, BINDING_LABELS.get(status, status), "bağlayıcı", detail)


def e3_not_related_party(x: RuleInput, p: RuleParams) -> Check:
    ok = x.related_party is False
    detail = "Karşı taraf ilişkili taraf değil." if ok else "Karşı taraf ilişkili taraf olabilir: işlem yok."
    return Check(
        "E3.not_related_party", ok, "ilişkili değil" if ok else "ilişkili taraf", "ilişkili taraf değil", detail
    )


def e3_not_renewal(x: RuleInput, p: RuleParams) -> Check:
    ok = x.renewal is False
    detail = "Yenileme veya uzatma değil." if ok else "Mevcut sözleşmenin yenilenmesi: yeni iş değil."
    return Check("E3.not_renewal", ok, "yeni iş" if ok else "yenileme", "yenileme değil", detail)


def e3_amount_in_text(x: RuleInput, p: RuleParams) -> Check:
    ok = bool(x.amount_in_text)
    observed = fmt_try(x.reader_amount_try) if x.reader_amount_try is not None else None
    detail = (
        "Okuyucu tutarı metindeki tutarla eşleşti (R14)." if ok else "Okuyucu tutarı metinde bulunamadı (R14): ret."
    )
    return Check("E3.amount_in_text", ok, observed, "regex eşleşmesi", detail)


# ── E4: earnings ─────────────────────────────────────────────────────────
def e4_sue(x: RuleInput, p: RuleParams) -> Check:
    sue = x.e4_sue or 0.0
    ok = sue >= p.e4_sue_min
    observed = fmt_dec(sue, 1)
    detail = f"Beklenmeyen kâr standart sapmanın {observed} katı." if ok else "Beklenmeyen kâr eşik altında."
    return Check("E4.sue", ok, observed, f"≥ {fmt_dec(p.e4_sue_min, 1)}", detail)


def e4_cfo_quality(x: RuleInput, p: RuleParams) -> Check:
    q = x.e4_cfo_quality
    ok = q == "iyi" if isinstance(q, str) else (q is not None and q >= p.e4_cfo_quality_min)
    observed = q if isinstance(q, str) else (fmt_dec(q, 2) if q is not None else None)
    detail = "Faaliyet nakit akışı kârı destekliyor." if ok else "Nakit akışı kârı desteklemiyor."
    return Check("E4.cfo_quality", ok, observed, "nakit akışı destekliyor", detail)


def e4_ret10d(x: RuleInput, p: RuleParams) -> Check:
    ret = x.ret_10d or 0.0
    ok = ret < p.e4_ret10d_max
    detail = "Son 10 seansta aşırı yükseliş yok." if ok else "Son 10 seansta %12'yi aşan yükseliş: atla."
    return Check("E4.ret10d", ok, fmt_signed_pct(ret, 1), f"< {fmt_pct(p.e4_ret10d_max, 0)}", detail)


EVENT_RULES: Final[dict[str, tuple[Rule, ...]]] = {
    "E1": (e1_capital_10d, e1_execution, e1_no_recent_sale),
    "E2": (e2_open_market, e2_insider_role, e2_min_value),
    "E3": (e3_materiality, e3_binding, e3_not_related_party, e3_not_renewal, e3_amount_in_text),
    "E4": (e4_sue, e4_cfo_quality, e4_ret10d),
}
