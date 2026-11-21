import { AuditListQuery, LimitDecisionInput, LimitProposalInput, limitViolations, NoteInput, type LimitsView, type LimitVersion, type ProposalNote } from "@/lib/domain";
import { verifyChain } from "@/lib/audit-chain";
import { auditMatches } from "@/lib/audit-words";
import { ApiError, type KaptanApi } from "../types";
import { parse, recordWaiver, signatureOf, userActor, type MockCtx } from "./guard";
import type { MockState } from "./state";
import * as sel from "./selectors";

/**
 * Notes, limit changes and the audit ledger. One
 * person takes every step; each waived second signature is written to the ledger.
 */
type Enterprise = Pick<
  KaptanApi,
  "listNotes" | "addNote" | "limits" | "proposeLimit" | "decideLimit" | "auditList" | "verifyAudit"
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
  const emitLimits = () => db.bus.emit("desk", "limits.changed", limitsView(db.snapshot));

  return {
    async listNotes(proposalId) {
      ctx.me();
      return ok(db.snapshot.proposalNotes.filter((n) => n.proposal_id === proposalId), 60);
    },

    async addNote(proposalId, body) {
      const a = ctx.me();
      const input = parse(NoteInput, { body });
      const card = sel.approvalCards(db.snapshot).find((c) => c.proposal_id === proposalId);
      if (!card) throw new ApiError(404, "not_found", "Öneri bulunamadı.");
      const note: ProposalNote = {
        id: `not-${db.snapshot.proposalNotes.length + 1}`,
        proposal_id: proposalId,
        uid: a.uid,
        name: a.name,
        body: input.body,
        created_at: now(),
      };
      db.update((s) => ({ ...s, proposalNotes: [...s.proposalNotes, note] }));
      db.audit(userActor(a), "note.added", "trade_proposal", proposalId, { ticker: card.ticker, company: card.company_name }, card.run_id);
      return ok(note);
    },

    async limits() {
      ctx.me();
      return ok(limitsView(db.snapshot));
    },

    async proposeLimit(input) {
      const a = ctx.me();
      const d = parse(LimitProposalInput, input);
      const view = limitsView(db.snapshot);
      if (view.pending) throw new ApiError(409, "pending_exists", "Bekleyen bir değişiklik zaten var.");
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
      db.audit(userActor(a), "limits.proposed", "limit_version", String(version.version), { key: d.key, from: current?.value ?? null, to: d.value });
      emitLimits();
      return ok(limitsView(db.snapshot));
    },

    async decideLimit(versionNo, input) {
      const a = ctx.me();
      const d = parse(LimitDecisionInput, input);
      const v = db.snapshot.limitVersions.find((x) => x.version === versionNo);
      if (!v || v.status !== "proposed") throw new ApiError(409, "conflict", "Bu değişiklik artık beklemiyor.");
      recordWaiver(ctx, a, "limits", ["limit_version", String(versionNo)]);
      const at = now();
      const decided: LimitVersion = { ...v, status: d.decision === "approve" ? "active" : "rejected", effective_from: d.decision === "approve" ? at : null, decided_by: signatureOf(a, at, d.comment || null) };
      db.update((s) => ({
        ...s,
        limitVersions: s.limitVersions.map((x) => (x.version === versionNo ? decided : d.decision === "approve" && x.status === "active" ? { ...x, status: "superseded" } : x)),
      }));
      db.audit(userActor(a), d.decision === "approve" ? "limits.approved" : "limits.rejected", "limit_version", String(versionNo), { proposed_by: v.proposed_by.uid });
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
      return ok({ items: rows.slice(0, q.limit), total: rows.length, length: chain.length }, 120);
    },

    async verifyAudit() {
      ctx.me();
      const result = verifyChain(db.auditChain(), now());
      // Verifying has no side effects on the chain itself; the walk is remembered, not recorded.
      db.update((s) => ({ ...s, verifiedAt: result.verified_at }));
      return ok(result, 400);
    },
  };
}
