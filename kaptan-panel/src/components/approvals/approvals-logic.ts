import type { ApprovalCard, ApprovalDecision, ApprovalStatus, Order, Role, RuleTraceEntry } from "@/lib/domain";
import { can, deniedHint } from "@/lib/auth/permissions";
import { COMMENT_MAX, validateComment } from "@/components/ui/field";
import { fmtInt, fmtPrice, fmtTry } from "@/lib/format";

/**
 * Pure logic behind /approvals (FRONTEND-SPEC §2.3, US-26/27/28, FR-24): who may decide,
 * when, how "Küçült" is validated (approve with a smaller amount, §9 Ç-9), and how the
 * paper execution after an approval is described. Tested without React.
 */

/** Pending cards past their 09:50 deadline read as expired even before the server says so. */
export function effectiveStatus(card: Pick<ApprovalCard, "status" | "expires_at">, nowMs: number | null): ApprovalStatus {
  if (card.status === "pending" && nowMs !== null && Date.parse(card.expires_at) <= nowMs) return "expired";
  return card.status;
}

export const STATUS_LABEL: Readonly<Record<ApprovalStatus, string>> = {
  pending: "Karar bekliyor",
  claimed: "Başka oturumda inceleniyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  expired: "Süresi doldu (09:50)",
  cancelled: "İptal (kill switch)",
};

export function isOpen(status: ApprovalStatus): boolean {
  return status === "pending" || status === "claimed";
}

/** Queue order: open cards first, soonest deadline first; then decided, newest first. */
export function sortQueue(cards: readonly ApprovalCard[], nowMs: number | null): ApprovalCard[] {
  return [...cards].sort((a, b) => {
    const ao = isOpen(effectiveStatus(a, nowMs));
    const bo = isOpen(effectiveStatus(b, nowMs));
    if (ao !== bo) return ao ? -1 : 1;
    if (ao) return Date.parse(a.expires_at) - Date.parse(b.expires_at) || Date.parse(b.created_at) - Date.parse(a.created_at);
    return Date.parse(b.decided_at ?? b.created_at) - Date.parse(a.decided_at ?? a.created_at);
  });
}

/** Replace-or-insert by proposal id (live SSE cards win over the last fetch). */
export function upsertCards(base: readonly ApprovalCard[], live: readonly ApprovalCard[]): ApprovalCard[] {
  const map = new Map<string, ApprovalCard>();
  for (const c of base) map.set(c.proposal_id, c);
  for (const c of live) map.set(c.proposal_id, c);
  return [...map.values()];
}

/* ── who may decide, and when ────────────────────────────────────────── */
export interface DecideGate {
  /** Any decision (approve, shrink, reject) is possible. */
  canDecide: boolean;
  /** Approve/shrink specifically (blocked by the daily −1% halt; reject is still allowed). */
  canApprove: boolean;
  /** Why the controls are disabled (shown as a hint; never hide the buttons, PANEL-CONTRACT §3.3). */
  reason: string | null;
  tone: "role" | "kill" | "halt" | "closed" | null;
}

export function decideGate(input: {
  role: Role;
  status: ApprovalStatus;
  killSwitchOn: boolean;
  haltedToday: boolean;
}): DecideGate {
  if (!can(input.role, "approve")) return { canDecide: false, canApprove: false, reason: deniedHint("approve"), tone: "role" };
  if (input.killSwitchOn) return { canDecide: false, canApprove: false, reason: "Kill switch açık: yeni emir onaylanamaz.", tone: "kill" };
  if (!isOpen(input.status)) return { canDecide: false, canApprove: false, reason: `Bu öneri karara bağlandı: ${STATUS_LABEL[input.status]}.`, tone: "closed" };
  if (input.haltedToday) {
    return { canDecide: true, canApprove: false, reason: "Günlük −%1 durdurması (R02): bugün onay verilemez, yalnızca ret.", tone: "halt" };
  }
  return { canDecide: true, canApprove: true, reason: null, tone: null };
}

/* ── the decision form ───────────────────────────────────────────────── */
export type DecisionKind = "approve" | "shrink" | "reject";

export const DECISION_COPY: Readonly<Record<DecisionKind, { title: string; submit: string; verb: string }>> = {
  approve: { title: "Onayla", submit: "Onayla ve gönder", verb: "onaylanıyor" },
  shrink: { title: "Küçült ve onayla", submit: "Küçültülmüş tutarla onayla", verb: "küçültülerek onaylanıyor" },
  reject: { title: "Reddet", submit: "Reddet", verb: "reddediliyor" },
};

/** Whole lots the amount buys at the limit price. */
export function lotsFor(amountTry: number, limitPrice: number): number {
  if (!(amountTry > 0) || !(limitPrice > 0)) return 0;
  return Math.floor(amountTry / limitPrice);
}

/** Quick shrink amounts: ×0,75 / ×0,5 / ×0,25 of the post-risk amount, rounded down to whole lots. */
export function shrinkPresets(finalTry: number, limitPrice: number): Array<{ factor: number; amount: number; lots: number }> {
  return [0.75, 0.5, 0.25]
    .map((factor) => {
      const lots = lotsFor(finalTry * factor, limitPrice);
      return { factor, lots, amount: Math.round(lots * limitPrice) };
    })
    .filter((p) => p.lots > 0);
}

/** Parse "45.000", "45000" or "45.000,50" (tr-TR) into a number; null when not a number. */
export function parseTryAmount(raw: string): number | null {
  const t = raw.replace(/\s|TL/gi, "");
  if (!t) return null;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/** Shrink = approve with a smaller amount; growing (or equal) is not a shrink (FR-24). */
export function validateShrink(amount: number | null, finalTry: number, limitPrice: number): string | null {
  if (amount === null) return "Tutarı TL olarak girin.";
  if (amount <= 0) return "Tutar sıfırdan büyük olmalı.";
  if (amount >= finalTry) return `Küçültme, risk sonrası tutardan (${fmtTry(finalTry)}) az olmalı; büyütme yok.`;
  if (lotsFor(amount, limitPrice) < 1) return `En az bir lot gerekir (${fmtPrice(limitPrice)}).`;
  return null;
}

export const TOTP_RE = /^\d{6}$/;

export interface DecisionDraft {
  kind: DecisionKind;
  comment: string;
  totp: string;
  /** Raw amount text for "Küçült". */
  amount: string;
}

export interface DraftErrors {
  comment: string | null;
  totp: string | null;
  amount: string | null;
}

export function draftErrors(d: DecisionDraft, card: Pick<ApprovalCard, "final_notional_try" | "limit_price">): DraftErrors {
  return {
    comment: validateComment(d.comment, 1, COMMENT_MAX),
    totp: TOTP_RE.test(d.totp) ? null : "6 haneli doğrulama kodu girin.",
    amount: d.kind === "shrink" ? validateShrink(parseTryAmount(d.amount), card.final_notional_try, card.limit_price) : null,
  };
}

export function hasErrors(e: DraftErrors): boolean {
  return Boolean(e.comment || e.totp || e.amount);
}

/** The exact payload for POST /approvals/{id}/decision (05 ApprovalDecision). */
export function buildDecision(d: DecisionDraft): ApprovalDecision {
  return {
    decision: d.kind === "reject" ? "reject" : "approve",
    approved_notional_try: d.kind === "shrink" ? parseTryAmount(d.amount) : null,
    comment: d.comment.trim(),
    totp: d.totp,
  };
}

/* ── reading the card ────────────────────────────────────────────────── */
export function traceTally(trace: readonly RuleTraceEntry[]): { passed: number; total: number } {
  return { passed: trace.filter((t) => t.passed).length, total: trace.length };
}

/** Leak filter (LEAK.ret5d, 06 sızıntı < %8): pulled out of the rule trace for the card header. */
export function leakFilter(trace: readonly RuleTraceEntry[]): RuleTraceEntry | null {
  return trace.find((t) => t.rule.startsWith("LEAK.")) ?? null;
}

/** "×0,5" for the skeptic size multiplier; null when no reduction. */
export function multiplierLabel(m: number): string | null {
  if (m >= 1) return null;
  return `×${String(m).replace(".", ",")}`;
}

/** The share the risk gate kept: final / requested. */
export function keptShare(card: Pick<ApprovalCard, "final_notional_try" | "requested_notional_try">): number | null {
  if (card.requested_notional_try <= 0) return null;
  return card.final_notional_try / card.requested_notional_try;
}

export const ENTRY_LABEL: Readonly<Record<ApprovalCard["entry"], string>> = {
  next_open_auction: "Ertesi açılış (09:40 emir toplama)",
  intraday_limit: "Gün içi limit",
};

export const ESCALATION_LABEL: Readonly<Record<ApprovalCard["escalation_reasons"][number], string>> = {
  COMPLIANCE_ESCALATE: "Uyum incelemesi",
  DEGRADED: "Yedek model (degraded)",
  NEAR_MAX_POSITIONS: "Pozisyon sınırına yakın",
  RESTRICTED_SELL: "Kısıtlı satış",
  RESIZED: "Risk kapısında küçültüldü",
};

/* ── after the decision: paper execution (SimBIST) ───────────────────── */
export type ExecTone = "done" | "waiting" | "partial" | "failed" | "idle";

export interface ExecStage {
  label: string;
  detail: string;
  tone: ExecTone;
}

/**
 * Describe the order state for the card's execution rail, including the two failure modes
 * the desk must read at a glance: a partial fill and "tavanda açıldı, dolmadı" (the opening
 * auction printed above the buy limit, so the OPG order lapsed unfilled).
 */
export function executionStage(order: Order | undefined): ExecStage {
  if (!order) return { label: "Emir bekleniyor", detail: "Onaydan sonra graf devam eder (resume) ve SimBIST'e emir yazar.", tone: "idle" };
  const filledQty = order.fills.reduce((a, f) => a + f.qty, 0);
  const last = order.fills[order.fills.length - 1];
  switch (order.status) {
    case "pending_open":
      return {
        label: "Açılışı bekliyor",
        detail: `SimBIST · ${fmtInt(order.qty)} lot · limit ${order.limit_price ? fmtPrice(order.limit_price) : "—"} · ertesi seans 09:40 emir toplamaya girer.`,
        tone: "waiting",
      };
    case "accepted":
      return { label: "Emir kabul edildi", detail: `SimBIST · ${fmtInt(order.qty)} lot gün içi limit; dolum bekleniyor.`, tone: "waiting" };
    case "awaiting_manual_entry":
      return { label: "Manuel giriş bekliyor", detail: "Kişisel mod: emir fişi aracı kuruma elle girilir.", tone: "waiting" };
    case "partially_filled":
      return {
        label: "Kısmi dolum",
        detail: `${fmtInt(filledQty)} / ${fmtInt(order.qty)} lot doldu${last ? ` @ ${fmtPrice(last.price)}` : ""}; kalan gün sonunda düşer.`,
        tone: "partial",
      };
    case "filled":
      return {
        label: "Doldu",
        detail: `${fmtInt(filledQty)} lot @ ${last ? fmtPrice(last.price) : "—"} · SimBIST paper (sanal para).`,
        tone: "done",
      };
    case "canceled":
      if (order.cancel_reason === "kill_switch") {
        return { label: "Kill switch iptal etti", detail: "Açık emirler kill switch ile iptal edildi; pozisyonlar satılmadı.", tone: "failed" };
      }
      if (order.cancel_reason === "limit_up_open" || (order.cancel_reason == null && filledQty === 0 && order.tif === "opg")) {
        return {
          label: "Tavanda açıldı, dolmadı",
          detail: "Açılış fiyatı alış limitinin üstünde (tavan) oluştu; emir dolmadan düştü. Kovalamak yok.",
          tone: "failed",
        };
      }
      return { label: "İptal edildi", detail: filledQty > 0 ? `${fmtInt(filledQty)} lot dolduktan sonra kalan iptal edildi.` : "Emir dolmadan iptal edildi.", tone: "failed" };
    case "rejected":
      return { label: "Reddedildi (aracı)", detail: "SimBIST emri kabul etmedi; gönderim anı kontrolü (R16).", tone: "failed" };
  }
}
