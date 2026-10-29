"""The risk gate R01–R16 (06 §10, 05 §5.2): the last deterministic brake. Pure, no I/O.

Rules run in `RISK_GATE_ORDER`; the first REJECT or HOLD stops the chain, RESIZEs shrink the
quantity cumulatively and the gate never grows it (monotone). R15 always asks a human (no auto
execution); R16 re-checks the hard rules at send time. Texts are the panel's (RISK_RULES).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field, replace
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal
from typing import Final, Literal

from kaptan.domain.schemas.rules import RISK_GATE_ORDER, RISK_RULES, RiskRuleCode
from kaptan.rules.format import fmt_dec, fmt_pct, fmt_signed_pct

Outcome = Literal["pass", "resize", "reject", "hold", "approval_required"]
Phase = Literal["pre_trade", "at_send"]

HARD_RESTRICTIONS: Final = frozenset(
    {"spk_tedbir", "vbts_brut_takas", "vbts_aciga_satis", "vbts_kredili_islem", "vbts_tek_fiyat", "trading_halt"}
)
AT_SEND_RULES: Final[tuple[RiskRuleCode, ...]] = ("R01", "R02", "R03", "R04", "R09", "R12", "R13")
CENT: Final = Decimal("0.01")
#: P8 (06 §7.2): the one refusal text, shared with GuardedBroker (kaptan.brokers.guarded).
COOLDOWN_TR: Final = "Stop sonrası bekleme: bu hisseye 10 seans yeni giriş yok (P8)."


@dataclass(frozen=True, slots=True)
class GateLimits:
    """The active limit version (trading.limits keys = field names; canonical defaults).

    Loaded per run by `kaptan.risk.active_limits`; a key without a row keeps the default here.
    """

    risk_per_trade_pct: Decimal = Decimal("0.005")
    #: Limit key `risk_tolerance` (default 1.05): R07's lot-rounding band on the per-trade risk budget.
    risk_tolerance: Decimal = Decimal("1.05")
    max_position_pct: Decimal = Decimal("0.10")
    max_concurrent_positions: int = 10
    target_concurrent_positions: int = 8
    max_adv_share: Decimal = Decimal("0.01")
    price_band_pct: Decimal = Decimal("0.02")
    near_limit_up_pct: Decimal = Decimal("0.01")
    max_price_age_s: int = 20 * 60
    daily_loss_halt_pct: Decimal = Decimal("-0.01")
    kill_drawdown_pct: Decimal = Decimal("-0.05")
    min_edge_cost_ratio: Decimal = Decimal(2)
    crisis_exposure_mult: Decimal = Decimal("0.5")
    max_sector_pct: Decimal = Decimal("0.25")
    max_group_pct: Decimal = Decimal("0.20")
    max_daily_entries: int = 3
    #: 06 §9: in the crisis regime at most one new entry per day.
    max_daily_entries_crisis: int = 1
    #: 06 §11 step 4: `m_reset`, the size multiplier after a kill-switch restart (until back within −2.5 %).
    reset_size_mult: Decimal = Decimal("0.5")
    min_evidence_n: int = 5
    amount_tolerance: Decimal = Decimal("0.005")
    max_kap_delay_s: int = 300
    max_restriction_age_h: int = 24


@dataclass(frozen=True, slots=True)
class GateOrder:
    """The proposal as the gate sees it."""

    ticker: str
    event_type: str
    qty: int
    limit_price: Decimal
    stop_pct: Decimal
    side: Literal["buy", "sell"] = "buy"
    reader_amount: Decimal | None = None
    regex_amounts: tuple[Decimal, ...] = ()
    evidence_ids: tuple[str, ...] = ()
    retrieved_ids: tuple[str, ...] = ()
    evidence_before_decision: bool = True
    expected_edge_bps: Decimal = Decimal(0)
    est_cost_bps: Decimal = Decimal(0)
    escalate_required: bool = False
    degraded: bool = False
    #: 06 R10: the rule engine already sized with m_regime (crisis ×0,5), so R10 must not shrink again.
    regime_applied: bool = False

    @property
    def notional(self) -> Decimal:
        return self.limit_price * self.qty


@dataclass(frozen=True, slots=True)
class GateContext:
    """Desk state at decision time (06 §10)."""

    equity_try: Decimal
    last_price: Decimal
    adv20_try: Decimal
    cash_free_try: Decimal
    upper_limit: Decimal | None = None
    kill_switch_on: bool = False
    drawdown_pct: Decimal = Decimal(0)
    daily_pnl_pct: Decimal = Decimal(0)
    halted_today: bool = False
    in_universe: bool = True
    restrictions: tuple[str, ...] = ()
    restrictions_age_h: float = 0.0
    team_blocklisted: bool = False
    quota_ok: bool = True
    kap_delay_s: float = 0.0
    schema_ok: bool = True
    injection_flag: bool = False
    price_age_s: float = 0.0
    n_open_positions: int = 0
    holds_ticker: bool = False
    daily_entries: int = 0
    #: P8 (06 §7.2): the ticker is inside a stop (X2) cooldown (kaptan.risk.cooldown).
    in_cooldown: bool = False
    #: 06 §11 step 4: a confirmed kill-switch restart is still in force (risk_state.reset_at).
    reset_active: bool = False
    sector_exposure_pct: Decimal = Decimal(0)
    group_exposure_pct: Decimal = Decimal(0)
    regime: Literal["normal", "crisis"] = "normal"
    mode: str = "paper"
    live_armed: bool = False
    compliance_decision: Literal["pass", "escalate", "veto"] = "pass"
    approval_expired: bool = False


@dataclass(frozen=True, slots=True)
class RiskResult:
    phase: Phase
    rule_code: RiskRuleCode
    outcome: Outcome
    detail_tr: str
    observed: str | None = None
    limit: str | None = None
    new_qty: int | None = None

    @property
    def reason_code(self) -> str | None:
        if self.rule_code == "R15":
            return "APPROVAL_REQUIRED"
        return None if self.outcome == "pass" else f"{self.rule_code}_{self.outcome.upper()}"

    def as_document(self) -> dict[str, object]:
        """The panel's RiskCheck shape."""
        return {
            "phase": self.phase,
            "rule_code": self.rule_code,
            "outcome": self.outcome,
            "reason_code": self.reason_code,
            "detail_tr": self.detail_tr,
            "observed": self.observed,
            "limit": self.limit,
        }


@dataclass(frozen=True, slots=True)
class GateVerdict:
    verdict: Literal["pass", "resize", "reject", "hold"]
    final_qty: int
    results: tuple[RiskResult, ...]
    level: Literal["normal", "escalate"] = "normal"
    escalation_reasons: tuple[str, ...] = field(default_factory=tuple)

    @property
    def approved(self) -> bool:
        return self.verdict in ("pass", "resize")


Check = Callable[[GateOrder, GateContext, GateLimits, Phase], RiskResult]


def _ok(code: RiskRuleCode, phase: Phase, detail: str | None = None, **kw: str | None) -> RiskResult:
    return RiskResult(phase, code, "pass", detail or RISK_RULES[code][1], kw.get("observed"), kw.get("limit"))


def _no(code: RiskRuleCode, phase: Phase, outcome: Outcome, detail: str, **kw: str | None) -> RiskResult:
    return RiskResult(phase, code, outcome, detail, kw.get("observed"), kw.get("limit"))


def _f(x: Decimal) -> float:
    return float(x)


def r01(o: GateOrder, c: GateContext, lim: GateLimits, ph: Phase) -> RiskResult:
    obs, cap = fmt_pct(_f(c.drawdown_pct), 1), fmt_pct(_f(lim.kill_drawdown_pct), 0)
    if o.side == "buy" and (c.kill_switch_on or c.drawdown_pct <= lim.kill_drawdown_pct):
        why = "Kill switch açık" if c.kill_switch_on else "Zirveden düşüş −%5 sınırında"
        return _no("R01", ph, "reject", f"{why}; yeni alım yok.", observed=obs, limit=cap)
    if o.side == "buy" and c.reset_active and ph == "pre_trade":  # 06 §11 step 4: m_reset (sizing only)
        mult = fmt_dec(_f(lim.reset_size_mult), 1)
        why = f"Kill switch yeniden başlatması sonrası boyut ×{mult}."
        res = _no("R01", ph, "resize", why, observed=obs, limit=cap)
        return replace(res, new_qty=_floor_qty(Decimal(o.qty) * lim.reset_size_mult))
    return _ok("R01", ph, f"Kill switch kapalı; zirveden düşüş {obs}.", observed=obs, limit=cap)


def r02(o: GateOrder, c: GateContext, lim: GateLimits, ph: Phase) -> RiskResult:
    obs, cap = fmt_signed_pct(_f(c.daily_pnl_pct), 1), fmt_pct(_f(lim.daily_loss_halt_pct), 0)
    if o.side == "buy" and (c.halted_today or c.daily_pnl_pct <= lim.daily_loss_halt_pct):
        return _no("R02", ph, "reject", f"Günlük K/Z {obs}; bugün yeni emir yok.", observed=obs, limit=cap)
    return _ok("R02", ph, f"Günlük K/Z {obs}.", observed=obs, limit=cap)


def r03(o: GateOrder, c: GateContext, lim: GateLimits, ph: Phase) -> RiskResult:
    return _ok("R03", ph) if c.in_universe else _no("R03", ph, "reject", "Hisse evren dışında.")


def r04(o: GateOrder, c: GateContext, lim: GateLimits, ph: Phase) -> RiskResult:
    hard = [k for k in c.restrictions if k in HARD_RESTRICTIONS]
    if o.side == "buy" and hard:
        return _no("R04", ph, "reject", f"Tedbirli hisse ({', '.join(hard)}): sert veto.")
    if c.restrictions_age_h > lim.max_restriction_age_h:
        return _no("R04", ph, "hold", "Tedbir verisi 24 saatten eski: HOLD.")
    return _ok("R04", ph)


def r13(o: GateOrder, c: GateContext, lim: GateLimits, ph: Phase) -> RiskResult:
    if o.side == "buy" and c.team_blocklisted:
        return _no("R13", ph, "reject", "Hisse ekip içeriden-öğrenen engel listesinde.")
    return _ok("R13", ph)


def r11(o: GateOrder, c: GateContext, lim: GateLimits, ph: Phase) -> RiskResult:
    if not c.quota_ok:
        return _no("R11", ph, "hold", "LLM kotası bitti: HOLD.")
    if c.kap_delay_s > lim.max_kap_delay_s:
        return _no("R11", ph, "hold", "KAP gecikmesi 300 saniyeyi aştı: HOLD.")
    if not c.schema_ok or c.injection_flag:
        return _no("R11", ph, "reject", "Şema hatası veya injection bayrağı: ret.")
    return _ok("R11", ph)


def r14(o: GateOrder, c: GateContext, lim: GateLimits, ph: Phase) -> RiskResult:
    if o.event_type not in ("E1", "E2", "E3") or o.reader_amount is None:
        return _ok("R14", ph)
    amt = o.reader_amount
    if any(abs(r - amt) <= abs(amt) * lim.amount_tolerance for r in o.regex_amounts):
        return _ok("R14", ph)
    return _no("R14", ph, "reject", "Okuyucu tutarı metindeki tutarlarla eşleşmiyor: ret.")


def r05(o: GateOrder, c: GateContext, lim: GateLimits, ph: Phase) -> RiskResult:
    subset = set(o.evidence_ids) <= set(o.retrieved_ids)
    if not subset or not o.evidence_before_decision or len(o.evidence_ids) < lim.min_evidence_n:
        return _no("R05", ph, "reject", "Kanıt kimlikleri doğrulanamadı veya n < 5: ret.")
    return _ok("R05", ph)


def r06(o: GateOrder, c: GateContext, lim: GateLimits, ph: Phase) -> RiskResult:
    if o.est_cost_bps <= 0 or o.expected_edge_bps < lim.min_edge_cost_ratio * o.est_cost_bps:
        return _no("R06", ph, "reject", "Beklenen avantaj maliyetin iki katından az: ret.")
    return _ok("R06", ph)


def r09(o: GateOrder, c: GateContext, lim: GateLimits, ph: Phase) -> RiskResult:
    band = (o.limit_price / c.last_price) - 1
    sign = "+" if band > 0 else ("−" if band < 0 else "")
    obs, cap = f"{sign}%{fmt_dec(abs(_f(band)) * 100, 1)}", f"±{fmt_pct(_f(lim.price_band_pct), 0)}"
    if c.price_age_s > lim.max_price_age_s:
        return _no("R09", ph, "hold", "Fiyat 20 dakikadan eski: HOLD.", observed=obs, limit=cap)
    ceiling = (c.last_price * (1 + lim.price_band_pct)).quantize(CENT, rounding=ROUND_HALF_UP)
    floor = (c.last_price * (1 - lim.price_band_pct)).quantize(CENT, rounding=ROUND_HALF_UP)
    if not floor <= o.limit_price <= ceiling:
        return _no("R09", ph, "reject", "Limit fiyat son fiyatın ±%2 bandı dışında.", observed=obs, limit=cap)
    if c.upper_limit is not None and o.limit_price >= c.upper_limit * (1 - lim.near_limit_up_pct):
        return _no("R09", ph, "reject", "Limit fiyat tavana %1'den yakın.", observed=obs, limit=cap)
    return _ok("R09", ph, "Limit fiyat son fiyatın ±%2 bandında; tavana uzak.", observed=obs, limit=cap)


def r12(o: GateOrder, c: GateContext, lim: GateLimits, ph: Phase) -> RiskResult:
    if o.side == "sell" and not c.holds_ticker:
        return _no("R12", ph, "reject", "Açığa satış yok: eldeki pozisyon olmadan satış reddedildi.")
    if c.mode == "live" and not c.live_armed:
        return _no("R12", ph, "reject", "Canlı mod silahlanmamış: ret.")
    return _ok("R12", ph)


def _floor_qty(x: Decimal) -> int:
    return int(x.to_integral_value(rounding=ROUND_FLOOR))


def r07(o: GateOrder, c: GateContext, lim: GateLimits, ph: Phase) -> RiskResult:
    price = o.limit_price
    caps = {
        "risk": _floor_qty(c.equity_try * lim.risk_per_trade_pct * lim.risk_tolerance / (price * o.stop_pct))
        if o.stop_pct > 0
        else o.qty,
        "position": _floor_qty(c.equity_try * lim.max_position_pct / price),
        "adv": _floor_qty(c.adv20_try * lim.max_adv_share / price),
        "cash": _floor_qty(c.cash_free_try / price),
    }
    qty = min(o.qty, *caps.values())
    pos, adv = o.notional / c.equity_try, o.notional / c.adv20_try
    obs, cap = fmt_pct(_f(pos), 1), fmt_pct(_f(lim.max_position_pct), 0)
    detail = f"İşlem riski {fmt_pct(_f(lim.risk_per_trade_pct), 1)}; pozisyon {obs}; hacmin {fmt_pct(_f(adv), 1)}'i."
    if qty <= 0:
        return _no("R07", ph, "reject", "Boyut sınırları içinde emir kalmıyor: ret.", observed=obs, limit=cap)
    if qty < o.qty:
        binding = min(caps, key=lambda k: caps[k])
        res = _no("R07", ph, "resize", f"{detail} Boyut küçültüldü ({binding}).", observed=obs, limit=cap)
        return replace(res, new_qty=qty)
    return _ok("R07", ph, detail, observed=obs, limit=cap)


def r08(o: GateOrder, c: GateContext, lim: GateLimits, ph: Phase) -> RiskResult:
    if c.holds_ticker:
        return _no("R08", ph, "reject", "Aynı hissede açık pozisyon var (piramit yok).")
    if c.n_open_positions >= lim.max_concurrent_positions:
        return _no("R08", ph, "reject", "En çok 10 eşzamanlı pozisyon sınırı dolu.")
    crisis = c.regime == "crisis"
    max_entries = lim.max_daily_entries_crisis if crisis else lim.max_daily_entries
    if c.daily_entries >= max_entries:
        where = "Kriz rejiminde günlük" if crisis else "Günlük"
        return _no("R08", ph, "reject", f"{where} yeni giriş sınırı ({max_entries}) dolu.")
    if o.side == "buy" and c.in_cooldown:
        return _no("R08", ph, "reject", COOLDOWN_TR)
    room = min(lim.max_sector_pct - c.sector_exposure_pct, lim.max_group_pct - c.group_exposure_pct)
    if room <= 0:
        return _no("R08", ph, "reject", "Sektör veya grup sınırı dolu.")
    room_qty = _floor_qty(c.equity_try * room / o.limit_price)
    if room_qty < o.qty:
        res = _no("R08", ph, "resize", "Sektör/grup sınırı için boyut küçültüldü.")
        return replace(res, new_qty=room_qty)
    return _ok("R08", ph)


def r10(o: GateOrder, c: GateContext, lim: GateLimits, ph: Phase) -> RiskResult:
    if c.regime != "crisis":
        return _ok("R10", ph)
    if o.event_type == "E3":
        return _no("R10", ph, "reject", "Kriz rejiminde yeni E3 yok.")
    if o.regime_applied:  # 06 R10 case 4: no double shrink
        return _ok("R10", ph, "Kriz rejimi: boyut kural motorunda ×0,5 küçültüldü (çift küçültme yok).")
    res = _no("R10", ph, "resize", "Kriz rejimi: maruziyet ×0,5.")
    return replace(res, new_qty=_floor_qty(Decimal(o.qty) * lim.crisis_exposure_mult))


CHECKS: Final[dict[RiskRuleCode, Check]] = {
    "R01": r01,
    "R02": r02,
    "R03": r03,
    "R04": r04,
    "R05": r05,
    "R06": r06,
    "R07": r07,
    "R08": r08,
    "R09": r09,
    "R10": r10,
    "R11": r11,
    "R12": r12,
    "R13": r13,
    "R14": r14,
}


def _r15(o: GateOrder, c: GateContext, lim: GateLimits, resized: bool) -> tuple[RiskResult, tuple[str, ...]]:
    reasons: list[str] = []
    if c.compliance_decision == "escalate" or o.escalate_required:
        reasons.append("COMPLIANCE_ESCALATE")
    if o.degraded:
        reasons.append("DEGRADED")
    if c.n_open_positions >= lim.target_concurrent_positions:
        reasons.append("NEAR_MAX_POSITIONS")
    if resized:
        reasons.append("RESIZED")
    return RiskResult("pre_trade", "R15", "approval_required", RISK_RULES["R15"][1]), tuple(reasons)


def evaluate(order: GateOrder, ctx: GateContext, limits: GateLimits | None = None) -> GateVerdict:
    """Pre-trade gate: R01 → … → R10 in RISK_GATE_ORDER, then R15 (approval required, level)."""
    lim = limits or GateLimits()
    if ctx.compliance_decision == "veto":
        raise ValueError("a compliance veto never reaches the risk gate")
    qty = order.qty
    results: list[RiskResult] = []
    for code in RISK_GATE_ORDER:
        if code == "R15":
            break
        r = CHECKS[code](replace(order, qty=qty), ctx, lim, "pre_trade")
        results.append(r)
        if r.outcome in ("reject", "hold"):
            return GateVerdict("reject" if r.outcome == "reject" else "hold", 0, tuple(results))
        if r.outcome == "resize" and r.new_qty is not None:
            qty = min(qty, r.new_qty)  # monotone: never grows
            if qty <= 0:
                return GateVerdict("reject", 0, tuple(results))
    resized = qty < order.qty
    approval, reasons = _r15(replace(order, qty=qty), ctx, lim, resized)
    results.append(approval)
    return GateVerdict(
        "resize" if resized else "pass",
        qty,
        tuple(results),
        level="escalate" if reasons else "normal",
        escalation_reasons=reasons,
    )


def evaluate_at_send(order: GateOrder, ctx: GateContext, limits: GateLimits | None = None) -> RiskResult:
    """R16: at send time the approval must still be valid and R01–R04, R09, R12, R13 must pass again."""
    lim = limits or GateLimits()
    if ctx.approval_expired:
        return _no("R16", "at_send", "reject", "Onay süresi doldu: gönderilmedi.")
    for code in AT_SEND_RULES:
        r = CHECKS[code](order, ctx, lim, "at_send")
        if r.outcome != "pass":
            return _no("R16", "at_send", "reject", f"Gönderim anında {code} geçmedi: {r.detail_tr}")
    return _ok(
        "R16",
        "at_send",
        "Gönderim anında R01–R04, R09, R12, R13 yeniden geçti; onay süresi dolmamış.",
    )
