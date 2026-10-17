import { AuditListQuery, LimitDecisionInput, LimitProposalInput, limitViolations, NoteInput, type LimitsView, type LimitVersion, type ProposalNote } from "@/lib/domain";
import { TEAM } from "@/lib/domain/user";
import { verifyChain } from "@/lib/audit-chain";
import { auditMatches } from "@/lib/audit-words";
import { ApiError, type KaptanApi } from "../types";
import { parse, signatureOf, userActor, type MockCtx } from "./guard";
import type { MockState } from "./state";
import * as sel from "./selectors";

/**
 * The enterprise half of the mock (SPEC.md §2): notes, the two-person kill-switch restart,
 * limits with a second signature, the audit ledger, the team and the tamper test.
 */
type Enterprise = Pick<
  KaptanApi,
  "users" | "listNotes" | "addNote" | "startKillReset" | "confirmKillReset" | "limits" | "proposeLimit" | "decideLimit" | "auditList" | "verifyAudit" | "setTamper"
>;

const istDay = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);

export function limitsView(s: MockState): LimitsView {
  const versions = [...s.limitVersions].sort((a, b) => b.version - a.version);
  const active = versions.find((v) => v.status === "active");
  if (!active) throw new ApiError(500, "no_active_limits", "Geçerli sınır sürümü bulunamadı.");
  return {
    active,
    pending: versions.find((v) => v.status === "proposed") ?? null,
    history: versions.filter((v) => v.status !== "proposed"),
  };
}

export function createEnterprise(ctx: MockCtx): Enterprise {
  const { db, ok, now } = ctx;
  const emitRisk = () => db.bus.emit("desk", "kill_switch", sel.riskStatus(db.snapshot));
  const emitLimits = () => db.bus.emit("desk", "limits.changed", limitsView(db.snapshot));

  return {
    async users() {
      ctx.me();
      return ok([...TEAM]);
    },

    async listNotes(proposalId) {
      ctx.me();
      return ok(db.snapshot.proposalNotes.filter((n) => n.proposal_id === proposalId), 60);
    },

    async addNote(proposalId, body) {
      const a = ctx.require("proposal.note");
      const input = parse(NoteInput, { body });
      const card = sel.approvalCards(db.snapshot).find((c) => c.proposal_id === proposalId);
      if (!card) throw new ApiError(404, "not_found", "Öneri bulunamadı.");
      const note: ProposalNote = {
        id: `not-${db.snapshot.proposalNotes.length + 1}`,
        proposal_id: proposalId,
        uid: a.uid,
        name: a.name,
        role: a.role,
        body: input.body,
        created_at: now(),
      };
      db.update((s) => ({ ...s, proposalNotes: [...s.proposalNotes, note] }));
      db.audit(userActor(a), "note.added", "trade_proposal", proposalId, { ticker: card.ticker, company: card.company_name, role: a.role }, card.run_id);
      return ok(note);
    },

    async startKillReset({ reason }) {
      const a = ctx.require("kill.reset_start");
      const text = reason.trim();
      if (text.length < 10) throw new ApiError(422, "validation", "Gerekçe en az 10 harf olmalı.");
      const r = db.snapshot.risk;
      if (r.kill_switch !== "on") throw new ApiError(409, "not_on", "Sistem çalışıyor; yeniden başlatılacak bir şey yok.");
      if (r.reset_started) throw new ApiError(409, "already_started", "Yeniden başlatma zaten başlatıldı; Risk Sorumlusu’nun onayını bekliyor.");
      db.update((s) => ({ ...s, risk: { ...s.risk, reset_started: signatureOf(a, now(), text) } }));
      db.audit(userActor(a), "kill_switch.reset_started", "system_flag", "kill_switch", { step: 1, role: a.role, reason: text });
      emitRisk();
      return ok(sel.riskStatus(db.snapshot));
    },

    async confirmKillReset({ reason }) {
      const a = ctx.require("kill.reset_confirm");
      const text = reason.trim();
      if (text.length < 10) throw new ApiError(422, "validation", "Gerekçe en az 10 harf olmalı.");
      const r = db.snapshot.risk;
      if (r.kill_switch !== "on") throw new ApiError(409, "not_on", "Sistem çalışıyor; yeniden başlatılacak bir şey yok.");
      if (!r.reset_started) throw new ApiError(409, "not_started", "Önce Yönetici yeniden başlatmayı başlatmalı (1/2).");
      if (r.reset_started.uid === a.uid) throw new ApiError(403, "same_person", "Başlatan kişi onaylayamaz; ikinci imza başka birinden gelir.");
      db.update((s) => ({
        ...s,
        risk: { ...s.risk, kill_switch: "off", kill_reason: null, kill_at: null, kill_by: null, reset_started: null, drawdown_pct: Math.max(s.risk.drawdown_pct, -0.049) },
      }));
      db.audit(userActor(a), "kill_switch.reset", "system_flag", "kill_switch", { step: 2, role: a.role, reason: text, started_by: r.reset_started.uid });
      emitRisk();
      return ok(sel.riskStatus(db.snapshot));
    },

    async limits() {
      ctx.me();
      return ok(limitsView(db.snapshot));
    },

    async proposeLimit(input) {
      const a = ctx.require("limits.propose");
      const d = parse(LimitProposalInput, input);
      const view = limitsView(db.snapshot);
      if (view.pending) throw new ApiError(409, "pending_exists", "İkinci imzayı bekleyen bir değişiklik zaten var.");
      const current = view.active.values.find((v) => v.key === d.key);
      if (current?.value === d.value) throw new ApiError(422, "no_change", "Yeni değer şimdikiyle aynı.");
      const values = view.active.values.map((v) => (v.key === d.key ? { ...v, value: d.value } : v));
      const problems = limitViolations(values);
      if (problems.length) throw new ApiError(422, "looser", problems[0] ?? "Sınır gevşetilemez.");
      const version: LimitVersion = {
        version: Math.max(...db.snapshot.limitVersions.map((v) => v.version)) + 1,
        status: "proposed",
        reason: d.reason,
        created_at: now(),
        effective_from: null,
        values,
        proposed_by: signatureOf(a, now(), d.reason),
        decided_by: null,
      };
      db.update((s) => ({ ...s, limitVersions: [...s.limitVersions, version] }));
      db.audit(userActor(a), "limits.proposed", "limit_version", String(version.version), { key: d.key, from: current?.value ?? null, to: d.value, role: a.role });
      emitLimits();
      return ok(limitsView(db.snapshot));
    },

    async decideLimit(versionNo, input) {
      const a = ctx.require("limits.decide");
      const d = parse(LimitDecisionInput, input);
      const v = db.snapshot.limitVersions.find((x) => x.version === versionNo);
      if (!v || v.status !== "proposed") throw new ApiError(409, "conflict", "Bu değişiklik artık imza beklemiyor.");
      if (v.proposed_by.uid === a.uid) throw new ApiError(403, "same_person", "Öneren kişi onaylayamaz; ikinci imza başka birinden gelir.");
      const at = now();
      const decided: LimitVersion = { ...v, status: d.decision === "approve" ? "active" : "rejected", effective_from: d.decision === "approve" ? at : null, decided_by: signatureOf(a, at, d.comment || null) };
      db.update((s) => ({
        ...s,
        limitVersions: s.limitVersions.map((x) => (x.version === versionNo ? decided : d.decision === "approve" && x.status === "active" ? { ...x, status: "superseded" } : x)),
      }));
      db.audit(userActor(a), d.decision === "approve" ? "limits.approved" : "limits.rejected", "limit_version", String(versionNo), { proposed_by: v.proposed_by.uid, role: a.role });
      emitLimits();
      return ok(limitsView(db.snapshot));
    },

    async auditList(query = {}) {
      ctx.me();
      const q = parse(AuditListQuery, query);
      const chain = db.auditChain();
      const today = istDay(now());
      const rows = chain
        .filter((e) => q.scope === "all" || istDay(e.occurred_at) === today)
        .filter((e) => !q.q || auditMatches(e, q.q))
        .reverse();
      return ok({ items: rows.slice(0, q.limit), total: rows.length, length: chain.length, tamper_on: db.snapshot.tamperOn }, 120);
    },

    async verifyAudit() {
      ctx.require("audit.verify");
      const result = verifyChain(db.auditChain(), now());
      // Verifying has no side effects on the chain itself; the walk is remembered, not recorded.
      db.update((s) => ({ ...s, verifiedAt: result.verified_at }));
      return ok(result, 400);
    },

    async setTamper(on) {
      ctx.require("demo.run");
      // The tamper test edits the demo data directly (no audit entry: that is the point of it).
      db.update((s) => ({ ...s, tamperOn: on }));
      return ok({ tamper_on: on });
    },
  };
}
