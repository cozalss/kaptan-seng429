import type { z } from "zod";
import {
  ApprovalDecision,
  LimitDecisionInput,
  LimitProposalInput,
  type AuditEntry,
  type AuditQuery,
  type LimitVersion,
  type Me,
  type Note,
  type Page,
} from "@/lib/domain";
import { verifyChain } from "@/lib/audit-chain";
import { can, deniedHint, type Perm } from "@/lib/auth/permissions";
import { DEMO_ACCOUNTS, EXTRA_ACCOUNTS } from "@/lib/auth/accounts";
import { evalSummary } from "@/mocks/eval";
import { SEED_UNIVERSE, DEMO_ORDER_TICKET } from "@/mocks/governance";
import { AUDIT_ANCHOR, MOCK_CONFIG } from "@/mocks/config";
import { DEMO_E3_RUN, type DemoScenario } from "@/mocks/ids";
import { paperPnl } from "@/mocks/pnl";
import { ApiError, type DisclosureQuery, type KaptanApi, type RunQuery } from "../types";
import type { AdminUserView } from "../admin-types";
import { buildBrief } from "./brief";
import { getMockDb, type Actor, type MockDb } from "./db";
import { engageKillSwitch, executeApproved, runDemoScenario, startLiveTicker, stopAllTimers, stopLiveTicker } from "./scenarios";
import * as sel from "./selectors";

const TOTP_RE = /^\d{6}$/;

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiError(422, "validation", r.error.issues[0]?.message ?? "Geçersiz girdi");
  return r.data;
}

/** Small, varied latency so loading states are real in mock mode. */
function delay<T>(value: T, ms = 140): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export interface MockApiOptions {
  getActor: () => Actor | null;
  db?: MockDb;
  latencyMs?: number;
  /** Start the live disclosure ticker (browser only). */
  live?: boolean;
}

export function createMockApi(opts: MockApiOptions): KaptanApi {
  const db = opts.db ?? getMockDb();
  const latency = opts.latencyMs ?? 140;
  if (opts.live !== false) startLiveTicker(db);
  const ok = <T,>(v: T, ms = latency) => delay(v, ms);

  const actor = (): Actor => {
    const a = opts.getActor();
    if (!a) throw new ApiError(401, "unauthenticated", "Oturum bulunamadı. Lütfen yeniden giriş yapın.");
    return a;
  };
  const requirePerm = (perm: Perm): Actor => {
    const a = actor();
    if (!can(a.role, perm)) throw new ApiError(403, "forbidden", deniedHint(perm));
    return a;
  };
  const requireTotp = (code: string) => {
    if (!TOTP_RE.test(code)) throw new ApiError(401, "step_up", "Bu işlem için 6 haneli doğrulama kodu gerekir.");
  };
  const now = () => db.nowIso();

  return {
    mode: "mock",

    async me(): Promise<Me> {
      const a = actor();
      const acc = [...DEMO_ACCOUNTS, ...EXTRA_ACCOUNTS].find((x) => x.uid === a.uid);
      return ok({ id: a.uid, email: acc?.email ?? "demo@kaptan.demo", display_name: a.name, roles: [a.role], mfa_fresh: false });
    },

    async listDisclosures(q: DisclosureQuery = {}) {
      requirePerm("view");
      const noise = q.noise ?? "hide";
      let rows = sel.visibleDisclosures(db.snapshot);
      if (noise === "hide") rows = rows.filter((r) => !r.is_noise);
      if (noise === "only") rows = rows.filter((r) => r.is_noise);
      if (q.ticker) rows = rows.filter((r) => r.stock_codes.includes(q.ticker!.toLocaleUpperCase("tr-TR")));
      if (q.event_code) {
        const code = q.event_code.toUpperCase();
        rows = rows.filter((r) => {
          const t = r.classification?.event_type;
          if (code === "X") return t === "FILTER";
          if (code === "O") return t === "IGNORE";
          return t === code || r.subject_route === code;
        });
      }
      const page = q.page ?? 1;
      const size = q.page_size ?? 50;
      return ok({ items: rows.slice((page - 1) * size, page * size), total: rows.length, page, page_size: size, counters: sel.counters(db.snapshot) });
    },

    async getDisclosure(index) {
      requirePerm("view");
      const row = sel.visibleDisclosures(db.snapshot).find((d) => d.disclosure_index === index);
      if (!row) throw new ApiError(404, "not_found", "Bildirim bulunamadı.");
      const e = row.run_id ? sel.explainFor(db.snapshot, row.run_id) : undefined;
      const texts = e?.texts ?? [
        { lang: "tr" as const, body: `${row.company_name} — ${row.subject} · Temsili\n\n${row.summary}\n\nBu metin KAPtan fikstürüdür.` },
        ...(row.has_multilang ? [{ lang: "en" as const, body: `${row.company_name} — illustrative English text (fixture).` }] : []),
      ];
      return ok({ ...row, texts, notes: db.snapshot.notes.filter((n) => n.disclosure_index === index) });
    },

    async addNote(index, body) {
      const a = requirePerm("note");
      const text = body.trim();
      if (!text || text.length > 1000) throw new ApiError(422, "validation", "Not 1–1000 karakter olmalı.");
      const note: Note = { id: `note-${Date.now()}`, disclosure_index: index, author: a.name, body: text, created_at: now() };
      db.update((s) => ({ ...s, notes: [...s.notes, note] }));
      db.audit(`user:${a.uid}`, "note.added", "disclosure", String(index), { length: text.length });
      return ok(note);
    },

    async counters() {
      requirePerm("view");
      return ok(sel.counters(db.snapshot), 60);
    },

    async listRuns(q: RunQuery = {}) {
      requirePerm("view");
      const runs = sel.runSummaries(db.snapshot).filter((r) => !q.status || r.status === q.status);
      return ok(runs);
    },

    async getRun(runId) {
      requirePerm("view");
      const e = sel.explainFor(db.snapshot, runId);
      if (!e) throw new ApiError(404, "not_found", "Çalıştırma bulunamadı.");
      return ok(e.run);
    },

    async explain(runId) {
      requirePerm("view");
      const e = sel.explainFor(db.snapshot, runId);
      if (!e) throw new ApiError(404, "not_found", "Çalıştırma bulunamadı.");
      return ok(e, latency + 120);
    },

    async listApprovals(status = "pending") {
      requirePerm("view");
      const cards = sel.approvalCards(db.snapshot).filter((c) => !c.run_id.startsWith("run-hist"));
      return ok(status === "all" ? cards : cards.filter((c) => c.status === status));
    },

    async decideApproval(proposalId, input) {
      const a = requirePerm("approve");
      const d = parse(ApprovalDecision, input);
      requireTotp(d.totp);
      const card = sel.approvalCards(db.snapshot).find((c) => c.proposal_id === proposalId);
      if (!card) throw new ApiError(404, "not_found", "Öneri bulunamadı.");
      if (db.snapshot.risk.kill_switch === "on") throw new ApiError(409, "kill_switch", "Kill switch açık: yeni emir onaylanamaz.");
      if (card.status !== "pending") throw new ApiError(409, "conflict", "Bu öneri başka bir oturumda karara bağlandı ya da süresi doldu.");
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
        decision_comment: d.comment,
        approved_notional_try: d.decision === "approve" ? d.approved_notional_try : null,
      };
      db.update((s) => ({ ...s, approvals: { ...s.approvals, [proposalId]: patch } }));
      db.audit(`user:${a.uid}`, "approval.decided", "trade_proposal", proposalId, { decision: d.decision, shrunk: d.approved_notional_try !== null }, card.run_id);
      const updated = { ...card, ...patch };
      db.bus.emit("desk", "approval.decided", updated);
      if (patch.status === "approved") executeApproved(db, proposalId);
      return ok(updated, latency + 200);
    },

    async listOrders() {
      requirePerm("view");
      return ok(sel.allOrders(db.snapshot));
    },

    async listTickets() {
      requirePerm("view");
      const e = sel.explainFor(db.snapshot, DEMO_E3_RUN);
      return ok(e?.ticket ? [e.ticket] : [DEMO_ORDER_TICKET]);
    },

    async manualFill(orderId, input) {
      const a = requirePerm("manual_fill");
      const order = sel.allOrders(db.snapshot).find((o) => o.id === orderId);
      if (!order) throw new ApiError(404, "not_found", "Emir bulunamadı.");
      if (input.qty <= 0 || input.price <= 0) throw new ApiError(422, "validation", "Adet ve fiyat pozitif olmalı.");
      const fill = { id: `fill-m-${Date.now()}`, order_id: orderId, qty: input.qty, price: input.price, commission: 0, bsmv: 0, slippage_bps: 0, filled_at: input.filled_at, source: "manual" as const };
      const updated = { ...order, status: "filled" as const, fills: [...order.fills, fill] };
      db.update((s) => ({ ...s, orders: [...s.orders.filter((o) => o.id !== orderId), updated] }));
      db.audit(`user:${a.uid}`, "order.manual_fill", "order", orderId, { qty: input.qty, price: input.price });
      return ok(updated);
    },

    async positions() {
      requirePerm("view");
      return ok(sel.positions(db.snapshot));
    },

    async pnl(from, to) {
      requirePerm("view");
      return ok(paperPnl().filter((p) => (!from || p.d >= from) && (!to || p.d <= to)));
    },

    async riskStatus() {
      requirePerm("view");
      return ok(sel.riskStatus(db.snapshot), 60);
    },

    async killSwitch(reason) {
      const a = requirePerm("kill_on");
      if (reason.trim().length < 5) throw new ApiError(422, "validation", "Gerekçe en az 5 karakter olmalı.");
      if (db.snapshot.risk.kill_switch === "on") throw new ApiError(409, "already_on", "Kill switch zaten açık.");
      engageKillSwitch(db, `user:${a.uid}`, reason.trim());
      return ok(sel.riskStatus(db.snapshot));
    },

    async requestKillReset({ reason, totp }) {
      const a = requirePerm("kill_reset_init");
      requireTotp(totp);
      if (db.snapshot.risk.kill_switch !== "on") throw new ApiError(409, "not_on", "Kill switch kapalı; sıfırlanacak bir şey yok.");
      if (reason.trim().length < 5) throw new ApiError(422, "validation", "Gerekçe en az 5 karakter olmalı.");
      const request = { id: `reset-${Date.now()}`, requested_by: a.uid, requested_by_name: a.name, requested_at: now(), reason: reason.trim(), confirmations: 1 as const };
      db.update((s) => ({ ...s, risk: { ...s.risk, reset_request: request } }));
      db.audit(`user:${a.uid}`, "kill_switch.reset_requested", "system_flag", "kill_switch", { reason: request.reason });
      db.bus.emit("desk", "kill_switch", sel.riskStatus(db.snapshot));
      return ok(request);
    },

    async confirmKillReset({ request_id, comment, totp }) {
      const a = requirePerm("kill_reset_confirm");
      requireTotp(totp);
      const req = db.snapshot.risk.reset_request;
      if (!req || req.id !== request_id) throw new ApiError(409, "no_request", "Bekleyen bir sıfırlama isteği yok.");
      if (req.requested_by === a.uid) throw new ApiError(403, "same_person", "Sıfırlamayı başlatan kişi onaylayamaz (dört göz).");
      if (!comment.trim()) throw new ApiError(422, "validation", "Onay gerekçesi zorunludur.");
      db.update((s) => ({
        ...s,
        risk: { ...s.risk, kill_switch: "off", kill_reason: null, kill_at: null, kill_by: null, reset_request: null, drawdown_pct: Math.max(s.risk.drawdown_pct, -0.049) },
      }));
      db.audit(`user:${a.uid}`, "kill_switch.reset", "system_flag", "kill_switch", { requested_by: req.requested_by, comment: comment.trim() });
      db.bus.emit("desk", "kill_switch", sel.riskStatus(db.snapshot));
      return ok(sel.riskStatus(db.snapshot));
    },

    async limits() {
      requirePerm("view");
      const active = db.snapshot.limitVersions.find((v) => v.status === "active");
      if (!active) throw new ApiError(500, "no_active_limits", "Geçerli limit sürümü bulunamadı.");
      return ok(active);
    },

    async limitsHistory() {
      requirePerm("view");
      return ok([...db.snapshot.limitVersions].sort((x, y) => y.version - x.version));
    },

    async proposeLimits(input) {
      const a = requirePerm("limit_propose");
      const d = parse(LimitProposalInput, input);
      if (db.snapshot.limitVersions.some((v) => v.status === "proposed")) throw new ApiError(409, "pending_exists", "Zaten onay bekleyen bir öneri var.");
      const active = db.snapshot.limitVersions.find((v) => v.status === "active");
      const values = (active?.values ?? []).map((v) => d.changes.find((c) => c.key === v.key) ?? v);
      const version: LimitVersion = {
        version: Math.max(...db.snapshot.limitVersions.map((v) => v.version)) + 1,
        status: "proposed",
        reason: d.reason,
        created_by: a.uid,
        created_by_name: a.name,
        created_at: now(),
        approved_by: null,
        approved_by_name: null,
        approved_at: null,
        decision_comment: null,
        effective_from: null,
        values,
      };
      db.update((s) => ({ ...s, limitVersions: [...s.limitVersions, version] }));
      db.audit(`user:${a.uid}`, "limits.proposed", "limit_version", String(version.version), { changes: d.changes.length });
      return ok(version);
    },

    async decideLimits(versionNo, input) {
      const a = requirePerm("limit_approve");
      const d = parse(LimitDecisionInput, input);
      const v = db.snapshot.limitVersions.find((x) => x.version === versionNo);
      if (!v || v.status !== "proposed") throw new ApiError(409, "not_pending", "Bu öneri artık onay beklemiyor.");
      if (v.created_by === a.uid) throw new ApiError(403, "same_person", "Öneren kişi onaylayamaz (dört göz).");
      const decided: LimitVersion = {
        ...v,
        status: d.decision === "approve" ? "active" : "rejected",
        approved_by: a.uid,
        approved_by_name: a.name,
        approved_at: now(),
        decision_comment: d.comment,
        effective_from: d.decision === "approve" ? now() : null,
      };
      db.update((s) => ({
        ...s,
        limitVersions: s.limitVersions.map((x) =>
          x.version === versionNo ? decided : d.decision === "approve" && x.status === "active" ? { ...x, status: "superseded" } : x,
        ),
      }));
      db.audit(`user:${a.uid}`, d.decision === "approve" ? "limits.approved" : "limits.rejected", "limit_version", String(versionNo), { proposer: v.created_by });
      if (d.decision === "approve") db.bus.emit("desk", "limits.changed", decided);
      return ok(decided);
    },

    async audit(q: AuditQuery = {}): Promise<Page<AuditEntry>> {
      requirePerm("view");
      let rows = sel.auditChain(db.snapshot).slice().reverse();
      if (q.actor) rows = rows.filter((r) => r.actor.includes(q.actor!));
      if (q.action) rows = rows.filter((r) => r.action.startsWith(q.action!));
      if (q.entity) rows = rows.filter((r) => r.entity_type === q.entity || r.entity_id === q.entity);
      if (q.from) rows = rows.filter((r) => r.occurred_at >= q.from!);
      if (q.run_id) rows = rows.filter((r) => r.run_id === q.run_id);
      const page = q.page ?? 1;
      const size = q.page_size ?? 100;
      return ok({ items: rows.slice((page - 1) * size, page * size), total: rows.length, page, page_size: size });
    },

    async verifyAudit() {
      requirePerm("audit_export");
      const chain = sel.auditChain(db.snapshot);
      const result = verifyChain(chain, now(), { ...AUDIT_ANCHOR, hash: chain[AUDIT_ANCHOR.chain_pos - 1]?.hash ?? "" });
      db.update((s) => ({ ...s, verifiedAt: result.verified_at }));
      return ok(result, 900);
    },

    async auditStatus() {
      requirePerm("view");
      const chain = sel.auditChain(db.snapshot);
      return ok({
        length: chain.length,
        head_hash: chain[chain.length - 1]?.hash ?? "00",
        last_verified_at: db.snapshot.verifiedAt,
        anchor: { ...AUDIT_ANCHOR, hash: chain[AUDIT_ANCHOR.chain_pos - 1]?.hash ?? "" },
        tamper_on: db.snapshot.tamperOn,
      });
    },

    async evalSummary() {
      requirePerm("view");
      return ok(evalSummary(), latency + 100);
    },

    async brief(date) {
      requirePerm("view");
      return ok(buildBrief(db.snapshot, date));
    },

    async adminConfig() {
      requirePerm("config");
      return ok(MOCK_CONFIG);
    },

    async adminUsers(): Promise<AdminUserView[]> {
      requirePerm("users");
      return ok(
        [...DEMO_ACCOUNTS, ...EXTRA_ACCOUNTS].map((acc) => ({
          id: acc.uid,
          email: acc.email,
          display_name: acc.name,
          roles: [acc.role],
          totp_enabled: acc.role === "risk_officer" || acc.role === "admin",
          last_login_at: acc.uid === actor().uid ? now() : "2027-01-11T05:48:00.000Z",
          active: true,
        })),
      );
    },

    async universe() {
      requirePerm("view");
      return ok([...SEED_UNIVERSE]);
    },

    async restricted() {
      requirePerm("view");
      return ok(db.snapshot.restricted);
    },

    async addRestricted(input) {
      const a = requirePerm("blocklist_add");
      const ticker = input.ticker.trim().toLocaleUpperCase("tr-TR");
      if (!/^[A-Z0-9]{3,6}$/.test(ticker)) throw new ApiError(422, "validation", "Geçerli bir sembol girin.");
      const entry = { id: `rs-${Date.now()}`, ticker, kind: input.kind, source_ref: input.source_ref, added_at: now(), added_by: a.uid, removal_requested_by: null };
      db.update((s) => ({ ...s, restricted: [...s.restricted, entry] }));
      db.audit(`user:${a.uid}`, "restricted.added", "restricted_security", entry.id, { ticker, kind: input.kind });
      return ok(entry);
    },

    async requestRestrictedRemoval(id) {
      const a = requirePerm("blocklist_add");
      const entry = db.snapshot.restricted.find((r) => r.id === id);
      if (!entry) throw new ApiError(404, "not_found", "Kayıt bulunamadı.");
      const updated = { ...entry, removal_requested_by: a.uid };
      db.update((s) => ({ ...s, restricted: s.restricted.map((r) => (r.id === id ? updated : r)) }));
      return ok(updated);
    },

    async confirmRestrictedRemoval(id) {
      const a = requirePerm("blocklist_remove_confirm");
      const entry = db.snapshot.restricted.find((r) => r.id === id);
      if (!entry?.removal_requested_by) throw new ApiError(409, "no_request", "Önce Admin çıkarma talebi açmalı.");
      db.update((s) => ({ ...s, restricted: s.restricted.filter((r) => r.id !== id) }));
      db.audit(`user:${a.uid}`, "restricted.removed", "restricted_security", id, { ticker: entry.ticker, requested_by: entry.removal_requested_by });
      return ok(undefined);
    },

    async liveArm() {
      requirePerm("view");
      return ok(db.snapshot.liveArm);
    },

    async armLive(totp) {
      const a = requirePerm("live_arm_init");
      requireTotp(totp);
      const next = { ...db.snapshot.liveArm, ui_armed_by: a.uid, ui_confirmed_by: null, armed: false };
      db.update((s) => ({ ...s, liveArm: next }));
      db.audit(`user:${a.uid}`, "live.arm_requested", "system_flag", "live_armed", {});
      return ok(next);
    },

    async confirmLive(totp) {
      const a = requirePerm("live_arm_confirm");
      requireTotp(totp);
      const cur = db.snapshot.liveArm;
      if (!cur.ui_armed_by) throw new ApiError(409, "not_requested", "Önce Admin canlı modu başlatmalı.");
      if (cur.ui_armed_by === a.uid) throw new ApiError(403, "same_person", "Başlatan kişi onaylayamaz.");
      // Config and env keys are off in the course build: the third key alone never arms live mode.
      const next = { ...cur, ui_confirmed_by: a.uid, armed: cur.config_live && cur.env_enabled };
      db.update((s) => ({ ...s, liveArm: next }));
      db.audit(`user:${a.uid}`, "live.arm_confirmed", "system_flag", "live_armed", { armed: next.armed });
      return ok(next);
    },

    async injectDemo(scenario: DemoScenario) {
      const a = requirePerm("demo_inject");
      return ok(runDemoScenario(db, a, scenario), 80);
    },

    async setTamper(on) {
      requirePerm("demo_inject");
      // The tamper test edits the demo DB directly (no audit entry: that is the point of it).
      db.update((s) => ({ ...s, tamperOn: on }));
      return ok(undefined);
    },

    async resetDemo() {
      requirePerm("demo_inject");
      stopAllTimers();
      stopLiveTicker();
      db.reset();
      startLiveTicker(db);
      return ok(undefined);
    },
  };
}

