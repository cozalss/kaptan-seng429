import { ApprovalDecision, TicketMarkInput, type Me, type TicketEntry } from "@/lib/domain";
import { memberForRole, Role } from "@/lib/domain/user";
import { type DemoScenario } from "@/mocks/ids";
import { paperPnl } from "@/mocks/pnl";
import { ApiError, type KaptanApi } from "../types";
import { getMockDb, type Actor, type MockDb } from "./db";
import { createEnterprise } from "./enterprise";
import { createCtx, parse, userActor } from "./guard";
import { engageKillSwitch, executeApproved, runDemoScenario, startLiveTicker, stopAllTimers, stopLiveTicker } from "./scenarios";
import * as sel from "./selectors";

export interface MockApiOptions {
  /** The signed-in person and their role; null = signed out → 401. */
  getActor: () => Actor | null;
  /** Store a new role in the session (the app: the mock session cookie). */
  onRoleChange?: (role: Role) => Promise<void>;
  db?: MockDb;
  latencyMs?: number;
  /** Start the live disclosure ticker (browser only). */
  live?: boolean;
}

/**
 * In-browser mock of the API (SPEC.md §2–3). One login, four roles: every write checks
 * `can(role, action)` and refuses with a typed 403 carrying the plain reason. Every write is
 * appended to the audit chain as `user:<uid>`; the agents and the risk monitor write as
 * `agent:*` / `system:*`.
 */
export function createMockApi(opts: MockApiOptions): KaptanApi {
  const db = opts.db ?? getMockDb();
  const ctx = createCtx(db, opts.getActor, opts.latencyMs ?? 140);
  if (opts.live !== false) startLiveTicker(db);
  const { ok, now, me } = ctx;

  return {
    mode: "mock",
    ...createEnterprise(ctx),

    async me(): Promise<Me> {
      const a = me();
      return ok({ id: a.uid, display_name: a.name, role: a.role });
    },

    async setRole(role) {
      me();
      const r = parse(Role, role);
      await opts.onRoleChange?.(r);
      const m = memberForRole(r);
      return ok({ id: m.uid, display_name: m.name, role: r }, 40);
    },

    async counters() {
      me();
      return ok(sel.counters(db.snapshot), 60);
    },

    async explain(runId) {
      me();
      const e = sel.explainFor(db.snapshot, runId);
      if (!e) throw new ApiError(404, "not_found", "Koşu bulunamadı.");
      return ok(e, 260);
    },

    async listApprovals(status = "pending") {
      me();
      const cards = sel.approvalCards(db.snapshot).filter((c) => !c.run_id.startsWith("run-hist"));
      return ok(status === "all" ? cards : cards.filter((c) => c.status === status));
    },

    async decideApproval(proposalId, input) {
      const a = ctx.require("proposal.decide");
      const d = parse(ApprovalDecision, input);
      const card = sel.approvalCards(db.snapshot).find((c) => c.proposal_id === proposalId);
      if (!card) throw new ApiError(404, "not_found", "Öneri bulunamadı.");
      if (db.snapshot.risk.kill_switch === "on") throw new ApiError(409, "kill_switch", "Her şey durduruldu: yeni emir onaylanamaz.");
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
        decided_role: a.role,
        decided_at: now(),
        decision_comment: d.comment || null,
        approved_notional_try: d.decision === "approve" ? d.approved_notional_try : null,
      };
      db.update((s) => ({ ...s, approvals: { ...s.approvals, [proposalId]: patch } }));
      db.audit(userActor(a), "approval.decided", "trade_proposal", proposalId, { ticker: card.ticker, company: card.company_name, decision: d.decision, role: a.role, note: d.comment.length > 0 }, card.run_id);
      const updated = { ...card, ...patch };
      db.bus.emit("desk", "approval.decided", updated);
      if (patch.status === "approved") executeApproved(db, proposalId);
      return ok(updated, 340);
    },

    async listTickets() {
      me();
      return ok(sel.allTickets(db.snapshot));
    },

    async markTicket(ticketNo, input) {
      const a = ctx.require("ticket.mark");
      const m = parse(TicketMarkInput, input);
      const ticket = sel.allTickets(db.snapshot).find((t) => t.ticket_no === ticketNo);
      if (!ticket) throw new ApiError(404, "not_found", "Fiş bulunamadı.");
      if (ticket.entry.status !== "awaiting" && ticket.entry.status !== "expired") {
        throw new ApiError(409, "already_marked", "Bu fiş zaten işaretlendi.");
      }
      if (m.mark === "entered") {
        if (m.filled_qty > ticket.qty) throw new ApiError(422, "over_qty", "Gerçekleşen adet fişteki adetten büyük olamaz.");
        if (ticket.side === "sell") {
          if (m.avg_price < ticket.limit_price) throw new ApiError(422, "under_limit", "Limit satışta ortalama fiyat limit fiyatın altında olamaz.");
        } else if (m.avg_price > ticket.limit_price) throw new ApiError(422, "over_limit", "Limit emirde ortalama fiyat limit fiyatı aşamaz.");
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
      db.audit(userActor(a), `ticket.${m.mark}`, "order_ticket", ticketNo, m.mark === "entered" ? { qty: m.filled_qty, price: m.avg_price } : {}, ticket.run_id);
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
      const a = ctx.require("kill.stop");
      if (reason.trim().length < 5) throw new ApiError(422, "validation", "Gerekçe en az 5 harf olmalı.");
      if (db.snapshot.risk.kill_switch === "on") throw new ApiError(409, "already_on", "Zaten durduruldu.");
      engageKillSwitch(db, userActor(a), reason.trim(), a.role);
      return ok(sel.riskStatus(db.snapshot));
    },

    async injectDemo(scenario: DemoScenario) {
      const a = ctx.require("demo.run");
      return ok(runDemoScenario(db, a, scenario), 80);
    },

    async resetDemo() {
      ctx.require("demo.run");
      stopAllTimers();
      stopLiveTicker();
      db.reset();
      startLiveTicker(db);
      return ok(undefined);
    },
  };
}

/** The actor a test or a fresh session runs as: the member on duty for a role. */
export function actorFor(role: Role): Actor {
  const m = memberForRole(role);
  return { uid: m.uid, name: m.name, role };
}
