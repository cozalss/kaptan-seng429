import type { AuditEntry } from "@/lib/domain";
import { appendToChain, type ChainFields } from "@/lib/audit-chain";
import { CLOCK_ANCHOR_MS } from "./clock";
import { AUDIT_BASE_LENGTH } from "./ids";
import { issuer, ISSUERS } from "./issuers";
import { createRng } from "./rng";
import { DAY_SPECS } from "./runs-day";

/**
 * The audit chain as of 13:40 on the demo day: exactly 4.812 entries (11 Adım 4),
 * starting when the chain went live in W7 (16 Nov 2026). Deterministic.
 */
const CHAIN_START_MS = Date.parse("2026-11-16T06:00:00.000Z");

type Fields = Omit<ChainFields, "chain_pos">;

const GENERIC: ReadonlyArray<{ action: string; actor: string; entity: string; w: number }> = [
  { action: "disclosure.ingested", actor: "system:kap_poller", entity: "disclosure", w: 52 },
  { action: "classification.done", actor: "agent:classifier", entity: "disclosure", w: 14 },
  { action: "pregate.decided", actor: "agent:pre_gate", entity: "disclosure", w: 10 },
  { action: "agent.output", actor: "agent:reader", entity: "agent_run", w: 5 },
  { action: "agent.output", actor: "agent:evidence", entity: "agent_run", w: 4 },
  { action: "agent.output", actor: "agent:skeptic", entity: "agent_run", w: 4 },
  { action: "rule.decided", actor: "agent:rule_engine", entity: "agent_run", w: 4 },
  { action: "risk.checked", actor: "agent:risk_gate", entity: "trade_proposal", w: 3 },
  { action: "proposal.created", actor: "agent:request_approval", entity: "trade_proposal", w: 1 },
  { action: "brief.generated", actor: "system:scheduler", entity: "brief", w: 1 },
  { action: "audit.verified", actor: "system:nightly_verify", entity: "audit_log", w: 1 },
  { action: "note.added", actor: "user:uye-2", entity: "disclosure", w: 1 },
];
const TOTAL_W = GENERIC.reduce((a, g) => a + g.w, 0);

function pickGeneric(r: number) {
  let acc = 0;
  for (const g of GENERIC) {
    acc += g.w / TOTAL_W;
    if (r < acc) return g;
  }
  return GENERIC[0]!;
}

function todayEntries(): Fields[] {
  const out: Fields[] = [];
  for (const s of DAY_SPECS) {
    const at = s.publishedAtIso;
    const company = issuer(s.ticker).name;
    const plus = (ms: number) => new Date(Date.parse(at) + ms).toISOString();
    out.push({
      occurred_at: plus(21_000),
      actor: "system:kap_poller",
      action: "disclosure.ingested",
      entity_type: "disclosure",
      entity_id: String(s.disclosure_index),
      run_id: null,
      strategy_version: null,
      payload: { ticker: s.ticker, company, subject: s.subject },
    });
    if (s.kind === "pregate_veto") {
      out.push({
        occurred_at: plus(21_200),
        actor: "agent:pre_gate",
        action: "risk.rejected",
        entity_type: "disclosure",
        entity_id: String(s.disclosure_index),
        run_id: s.run_id,
        strategy_version: s.strategy_version,
        payload: { ticker: s.ticker, company, reasons: s.preGateReasons ?? [], llm_calls: 0 },
      });
    }
    if (s.kind === "propose") {
      out.push({
        occurred_at: plus(48_000),
        actor: "agent:request_approval",
        action: "proposal.created",
        entity_type: "trade_proposal",
        entity_id: s.run_id.replace(/^run-/, "prop-"),
        run_id: s.run_id,
        strategy_version: s.strategy_version,
        payload: { ticker: s.ticker, company, qty: s.proposal?.qty ?? 0, event_type: s.event },
      });
    }
    if (s.decision && s.decision.status !== "pending" && s.decision.atIso) {
      out.push({
        occurred_at: s.decision.atIso,
        actor: `user:${s.decision.by ?? "uye-3"}`,
        action: "approval.decided",
        entity_type: "trade_proposal",
        entity_id: s.run_id.replace(/^run-/, "prop-"),
        run_id: s.run_id,
        strategy_version: s.strategy_version,
        payload: { ticker: s.ticker, company, decision: s.decision.status, role: "risk_officer", comment: s.decision.comment ?? "" },
      });
      if (s.decision.fill) {
        out.push({
          occurred_at: s.decision.fill.atIso,
          actor: "system:simbist",
          action: "order.filled",
          entity_type: "order",
          entity_id: s.run_id.replace(/^run-/, "ord-"),
          run_id: s.run_id,
          strategy_version: s.strategy_version,
          payload: { ticker: s.ticker, company, qty: s.proposal?.qty ?? 0, price: s.decision.fill.price },
        });
      }
    }
  }
  return out.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
}

function build(): AuditEntry[] {
  const rng = createRng(4_812);
  const today = todayEntries();
  const genericCount = AUDIT_BASE_LENGTH - today.length;
  const firstToday = Date.parse(today[0]?.occurred_at ?? new Date(CLOCK_ANCHOR_MS).toISOString());
  const span = firstToday - 60_000 - CHAIN_START_MS;
  const fields: Fields[] = [];
  const limitsAt = Math.floor(genericCount * 0.012);
  for (let i = 0; i < genericCount; i += 1) {
    const at = new Date(CHAIN_START_MS + Math.floor((span * i) / genericCount)).toISOString();
    if (i === limitsAt) {
      fields.push({
        occurred_at: at,
        actor: "user:uye-3",
        action: "limits.approved",
        entity_type: "limit_version",
        entity_id: "1",
        run_id: null,
        strategy_version: null,
        payload: { version: 1, proposed_by: "uye-1", reason: "Kanonik başlangıç limitleri" },
      });
      continue;
    }
    const g = pickGeneric(rng.next());
    const iss = rng.pick(ISSUERS);
    const idx = 1_600_000 + i * 11;
    fields.push({
      occurred_at: at,
      actor: g.actor,
      action: g.action,
      entity_type: g.entity,
      entity_id: g.entity === "disclosure" ? String(idx) : `${g.entity}-${i}`,
      run_id: g.entity === "agent_run" || g.entity === "trade_proposal" ? `run-hist-${i}` : null,
      strategy_version: g.actor.startsWith("agent:") ? (i < genericCount * 0.12 ? "v1.0-fwd" : "v1.1-fwd") : null,
      payload: g.entity === "disclosure" ? { ticker: iss.ticker } : { seq_hint: i },
    });
  }
  return appendToChain([], [...fields, ...today]);
}

let cache: AuditEntry[] | null = null;

export function baseAuditChain(): readonly AuditEntry[] {
  cache ??= build();
  return cache;
}


/** Tamper test (demo DB only): change one record's payload without recomputing its hash. */
export function tamperedChain(chain: readonly AuditEntry[], pos: number): AuditEntry[] {
  return chain.map((e) => (e.chain_pos === pos ? { ...e, payload: { ...e.payload, kurcalandi: true } } : e));
}
