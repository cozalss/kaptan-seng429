import type { z } from "zod";
import { ApprovalDecision, OWNER, TicketMarkInput, type Me, type TicketEntry } from "@/lib/domain";
import { type DemoScenario } from "@/mocks/ids";
import { paperPnl } from "@/mocks/pnl";
import { ApiError, type KaptanApi } from "../types";
import { getMockDb, type Actor, type MockDb } from "./db";
import { engageKillSwitch, executeApproved, runDemoScenario, startLiveTicker, stopAllTimers, stopLiveTicker } from "./scenarios";
import * as sel from "./selectors";

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiError(422, "validation", r.error.issues[0]?.message ?? "Geçersiz girdi");
  return r.data;
}

/** Small, varied latency so loading states are real in mock mode. */
function delay<T>(value: T, ms = 140): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Longest a single fast-forward may jump (Ayarlar → "zamanı ileri sar"). */
const MAX_CLOCK_STEP_H = 24 * 14;

export interface MockApiOptions {
  /** The signed-in person (always `OWNER` in personal mode); null = signed out → 401. */
  getActor: () => Actor | null;
  db?: MockDb;
  latencyMs?: number;
  /** Start the live disclosure ticker (browser only). */
  live?: boolean;
}

/**
 * In-browser mock of the personal-mode API (PERSONAL-SPEC §5). One user, no roles: the only
 * check is that someone is signed in. Every write is recorded in the audit chain as
 * `user:<uid>`; the agents and the risk monitor write as `agent:*` / `system:*`.
 */
export function createMockApi(opts: MockApiOptions): KaptanApi {
  const db = opts.db ?? getMockDb();
  const latency = opts.latencyMs ?? 140;
  if (opts.live !== false) startLiveTicker(db);
  const ok = <T,>(v: T, ms = latency) => delay(v, ms);

  const me = (): Actor => {
    const a = opts.getActor();
    if (!a) throw new ApiError(401, "unauthenticated", "Oturum bulunamadı. Lütfen yeniden giriş yapın.");
    return a;
  };
  const who = () => `user:${me().uid}`;
  const now = () => db.nowIso();

  return {
    mode: "mock",

    async me(): Promise<Me> {
      const a = me();
      return ok({ id: a.uid, display_name: a.name });
    },

    async counters() {
      me();
      return ok(sel.counters(db.snapshot), 60);
    },

    async explain(runId) {
      me();
      const e = sel.explainFor(db.snapshot, runId);
      if (!e) throw new ApiError(404, "not_found", "Koşu bulunamadı.");
      return ok(e, latency + 120);
    },

    async listApprovals(status = "pending") {
      me();
      const cards = sel.approvalCards(db.snapshot).filter((c) => !c.run_id.startsWith("run-hist"));
      return ok(status === "all" ? cards : cards.filter((c) => c.status === status));
    },

    async decideApproval(proposalId, input) {
      const a = me();
      const d = parse(ApprovalDecision, input);
      const card = sel.approvalCards(db.snapshot).find((c) => c.proposal_id === proposalId);
      if (!card) throw new ApiError(404, "not_found", "Öneri bulunamadı.");
      if (db.snapshot.risk.kill_switch === "on") throw new ApiError(409, "kill_switch", "Kill switch açık: yeni emir onaylanamaz.");
      if (card.status !== "pending") throw new ApiError(409, "conflict", "Bu öneri zaten karara bağlandı ya da süresi doldu.");
      if (d.approved_notional_try !== null && d.approved_notional_try > card.final_notional_try) {
        throw new ApiError(422, "grow_not_allowed", "Tutar yalnızca küçültülebilir; büyütme yok.");
      }
      if (d.decision === "approve" && db.snapshot.risk.halted_today) {
        throw new ApiError(409, "halted", "Günlük −%1 durdurması: bugün yeni emir verilemez.");
      }
      const patch = {
        status: d.decision === "approve" ? ("approved" as const) : ("rejected" as const),
        decided_by: a.uid,
        decided_at: now(),
        decision_comment: d.comment || null,
        approved_notional_try: d.decision === "approve" ? d.approved_notional_try : null,
      };
      db.update((s) => ({ ...s, approvals: { ...s.approvals, [proposalId]: patch } }));
      db.audit(who(), "approval.decided", "trade_proposal", proposalId, { decision: d.decision, shrunk: d.approved_notional_try !== null, note: d.comment.length > 0 }, card.run_id);
      const updated = { ...card, ...patch };
      db.bus.emit("desk", "approval.decided", updated);
      if (patch.status === "approved") executeApproved(db, proposalId);
      return ok(updated, latency + 200);
    },

    async listTickets() {
      me();
      return ok(sel.allTickets(db.snapshot));
    },

    async markTicket(ticketNo, input) {
      me();
      const m = parse(TicketMarkInput, input);
      const ticket = sel.allTickets(db.snapshot).find((t) => t.ticket_no === ticketNo);
      if (!ticket) throw new ApiError(404, "not_found", "Fiş bulunamadı.");
      if (ticket.entry.status !== "awaiting" && ticket.entry.status !== "expired") {
        throw new ApiError(409, "already_marked", "Bu fiş zaten işaretlendi.");
      }
      if (m.mark === "entered") {
        if (m.filled_qty > ticket.qty) throw new ApiError(422, "over_qty", "Gerçekleşen adet fişteki adetten büyük olamaz.");
        if (m.avg_price > ticket.limit_price) throw new ApiError(422, "over_limit", "Limit emirde ortalama fiyat limit fiyatı aşamaz.");
        if (Date.parse(m.filled_at) > Date.parse(ticket.valid_until)) {
          throw new ApiError(422, "after_ttl", "Fişin geçerlilik süresinden sonra girilen emir sayılmaz (R16).");
        }
      }
      const entry: TicketEntry = {
        status: m.mark,
        filled_qty: m.mark === "entered" ? m.filled_qty : null,
        avg_price: m.mark === "entered" ? m.avg_price : null,
        filled_at: m.mark === "entered" ? m.filled_at : null,
        note: m.note?.trim() || null,
        marked_at: now(),
      };
      db.update((s) => ({ ...s, ticketMarks: { ...s.ticketMarks, [ticketNo]: entry } }));
      db.audit(who(), `ticket.${m.mark}`, "order_ticket", ticketNo, m.mark === "entered" ? { qty: m.filled_qty, price: m.avg_price } : {}, ticket.run_id);
      const updated = { ...ticket, entry };
      db.bus.emit("desk", "ticket", updated);
      return ok(updated);
    },

    async positions() {
      me();
      return ok(sel.positions(db.snapshot));
    },

    async pnl(from, to) {
      me();
      return ok(paperPnl().filter((p) => (!from || p.d >= from) && (!to || p.d <= to)));
    },

    async riskStatus() {
      me();
      return ok(sel.riskStatus(db.snapshot), 60);
    },

    async killSwitch(reason) {
      me();
      if (reason.trim().length < 5) throw new ApiError(422, "validation", "Gerekçe en az 5 karakter olmalı.");
      if (db.snapshot.risk.kill_switch === "on") throw new ApiError(409, "already_on", "Kill switch zaten açık.");
      engageKillSwitch(db, who(), reason.trim());
      return ok(sel.riskStatus(db.snapshot));
    },

    async confirmKillReset({ reason }) {
      me();
      const text = reason.trim();
      if (text.length < 10) throw new ApiError(422, "validation", "Her onay için en az 10 karakterlik yazılı gerekçe gerekir.");
      const status = sel.riskStatus(db.snapshot);
      const reset = status.reset;
      if (status.kill_switch !== "on" || !reset) throw new ApiError(409, "not_on", "Kill switch kapalı; sıfırlanacak bir şey yok.");
      const at = new Date(sel.resetClockMs(db.snapshot)).toISOString();
      if (reset.next_step === "first") {
        db.update((s) => ({ ...s, risk: { ...s.risk, reset_first: { at, reason: text } } }));
        db.audit(who(), "kill_switch.reset_confirmed", "system_flag", "kill_switch", { step: 1, reason: text });
      } else if (reset.next_step === "wait") {
        throw new ApiError(409, "too_early", "İkinci onay için 24 saat ve 5 seans beklemesi henüz dolmadı.");
      } else {
        db.update((s) => ({
          ...s,
          risk: { ...s.risk, kill_switch: "off", kill_reason: null, kill_at: null, kill_by: null, reset_first: null, drawdown_pct: Math.max(s.risk.drawdown_pct, -0.049) },
        }));
        db.audit(who(), "kill_switch.reset", "system_flag", "kill_switch", { step: 2, reason: text, first_at: reset.first?.at ?? null });
      }
      const next = sel.riskStatus(db.snapshot);
      db.bus.emit("desk", "kill_switch", next);
      return ok(next);
    },

    async injectDemo(scenario: DemoScenario) {
      const a = me();
      return ok(runDemoScenario(db, a, scenario), 80);
    },

    async advanceDemoClock(hours) {
      me();
      if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_CLOCK_STEP_H) {
        throw new ApiError(422, "validation", `Saat 0 ile ${MAX_CLOCK_STEP_H} arasında olmalı.`);
      }
      db.update((s) => ({ ...s, clockOffsetH: s.clockOffsetH + hours }));
      const next = sel.riskStatus(db.snapshot);
      db.bus.emit("desk", "kill_switch", next);
      return ok(next);
    },

    async resetDemo() {
      me();
      stopAllTimers();
      stopLiveTicker();
      db.reset();
      startLiveTicker(db);
      return ok(undefined);
    },
  };
}

/** The personal-mode actor every mock client runs as. */
export const OWNER_ACTOR: Actor = { uid: OWNER.uid, name: OWNER.name };
