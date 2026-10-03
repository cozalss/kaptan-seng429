import { z } from "zod";
import { IsoDateTime } from "./common";

/**
 * The crew (Tayfa): the six LLM agents and the two deterministic stages that decide, in
 * pipeline order (landing `src/data/agents.js`, KAPTAN-BRIEF §0). The key is the graph node
 * name (05, `NodeName`); names, portraits and role sentences live in `src/lib/crew.ts`.
 */
export const CrewAgent = z.enum(["classifier", "reader", "materiality", "evidence", "skeptic", "compliance", "rule_engine", "risk_gate"]);
export type CrewAgent = z.infer<typeof CrewAgent>;

/**
 * What a crew member is doing right now:
 * working = a run is inside its node · waiting = its node is next in a running run ·
 * idle = nothing for it to do · hold = quota exhausted, safe default HOLD (R11) ·
 * degraded = answering on a fallback model.
 */
export const CrewActivity = z.enum(["working", "waiting", "idle", "hold", "degraded"]);
export type CrewActivity = z.infer<typeof CrewActivity>;

/** One recent output of a crew member: a node of a run, as the trace recorded it. */
export const CrewOutput = z.object({
  run_id: z.string(),
  ticker: z.string(),
  at: IsoDateTime,
  status: z.enum(["done", "skipped", "failed", "waiting", "running"]),
  /** One Turkish line: what it concluded ("E3 · güven 0,93", "×0,5 küçültüldü", "R04 sert veto"). */
  summary_tr: z.string(),
  latency_ms: z.number().int().nonnegative().nullable(),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  model_id: z.string().nullable(),
  cached: z.boolean(),
  is_fixture: z.boolean(),
});
export type CrewOutput = z.infer<typeof CrewOutput>;

export const CrewModelLink = z.object({
  provider: z.string(),
  model_id: z.string(),
  role: z.enum(["primary", "fallback", "local", "hold"]),
});
export type CrewModelLink = z.infer<typeof CrewModelLink>;

/** GET /crew and /crew/{agent}. Accuracy figures are sample values until the eval runs. */
export const CrewMemberStatus = z.object({
  agent: CrewAgent,
  activity: CrewActivity,
  /** "ORNEK bildirimini okuyor", "Boşta · son çıktı 13:42". */
  activity_tr: z.string(),
  current_run_id: z.string().nullable(),
  /** Empty for the deterministic stages (no model). */
  model_chain: z.array(CrewModelLink),
  active_model: z.string().nullable(),
  quota: z.object({ provider: z.string(), used: z.number().int().nonnegative(), limit: z.number().int().positive() }).nullable(),
  calls_today: z.number().int().nonnegative(),
  tokens_today: z.number().int().nonnegative(),
  latency_p50_ms: z.number().int().nonnegative().nullable(),
  latency_p95_ms: z.number().int().nonnegative().nullable(),
  accuracy: z
    .object({
      metric_tr: z.string(),
      value: z.number(),
      target: z.number().nullable(),
      /** Always true in mock mode: "örnek değer · gerçek sonuç değil". */
      is_sample: z.boolean(),
    })
    .nullable(),
  /** LLM agents: the prompt id/version/sha; deterministic stages: the rules hash. */
  prompt: z.object({ prompt_id: z.string(), version: z.string(), sha256: z.string() }).nullable(),
  /** prompt_manifest_hash of the frozen strategy version (v1.1-fwd). */
  manifest_hash: z.string(),
  recent: z.array(CrewOutput),
});
export type CrewMemberStatus = z.infer<typeof CrewMemberStatus>;
