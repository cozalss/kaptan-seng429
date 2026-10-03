import { z } from "zod";
import { IsoDateTime } from "./common";

/* ── Audit log: hash chain (07 §9 audit_log, 09 §7) ───────────────────── */
export const AuditActor = z.string().regex(/^(user|agent|system):[^\s]+$/);

export const AuditEntry = z.object({
  seq: z.number().int().positive(),
  chain_pos: z.number().int().positive(),
  occurred_at: IsoDateTime,
  actor: AuditActor,
  action: z.string().regex(/^[a-z_]+\.[a-z_.]+$/),
  entity_type: z.string(),
  entity_id: z.string(),
  run_id: z.string().nullable(),
  strategy_version: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  prev_hash: z.string().regex(/^[0-9a-f]{2}$|^[0-9a-f]{64}$/),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export const ChainFailureKind = z.enum([
  "gap_or_duplicate",
  "prev_hash_mismatch",
  "fields_changed_canonical_stale",
  "hash_mismatch",
  "anchor_mismatch",
]);
export type ChainFailureKind = z.infer<typeof ChainFailureKind>;

export const ChainVerifyResult = z.object({
  ok: z.boolean(),
  first_bad_pos: z.number().int().positive().nullable(),
  kind: ChainFailureKind.nullable(),
  checked: z.number().int().nonnegative(),
  head_hash: z.string(),
  verified_at: IsoDateTime,
  anchor: z.object({ at: IsoDateTime, chain_pos: z.number().int().positive(), hash: z.string() }).nullable(),
});
export type ChainVerifyResult = z.infer<typeof ChainVerifyResult>;

export const AuditQuery = z.object({
  entity: z.string().optional(),
  actor: z.string().optional(),
  action: z.string().optional(),
  from: z.string().optional(),
  /** Entries written for one run (deep links from /runs/[id]). */
  run_id: z.string().optional(),
  page: z.number().int().positive().optional(),
  page_size: z.number().int().positive().max(500).optional(),
});
export type AuditQuery = z.infer<typeof AuditQuery>;

/** GET /audit/status: chain head, last verification and the last external anchor (09 §7.1). */
export const AuditStatus = z.object({
  length: z.number().int().nonnegative(),
  head_hash: z.string(),
  last_verified_at: IsoDateTime.nullable(),
  anchor: z.object({ at: IsoDateTime, chain_pos: z.number().int().positive(), hash: z.string() }).nullable(),
  /** Demo DB only: the tamper test is switched on. Always false against a real API. */
  tamper_on: z.boolean(),
});
export type AuditStatus = z.infer<typeof AuditStatus>;

/** GET /admin/config: read-only version labels (04 §11–12, 09 §8). */
export const ConfigView = z.object({
  execution_mode: z.enum(["paper", "personal", "live"]),
  strategy_versions: z.array(z.object({ id: z.string(), frozen_at: IsoDateTime, scope_tr: z.string() })),
  rules_version: z.string(),
  rules_hash: z.string(),
  prompt_manifest_hash: z.string(),
  config_hash: z.string(),
  models: z.array(z.object({ role_tr: z.string(), model_id: z.string() })),
  kap_poll_seconds: z.number().int().positive(),
  approval_deadline_tr: z.string(),
  demo_mode: z.boolean(),
});
export type ConfigView = z.infer<typeof ConfigView>;

/* ── Limits (07 limit_versions / limits; canonical v1 seed) ───────────── */
export const LimitKey = z.enum([
  "risk_per_trade_pct",
  "max_position_pct",
  "max_concurrent_positions",
  "target_concurrent_positions",
  "max_adv_share",
  "price_band_pct",
  "daily_loss_halt_pct",
  "kill_drawdown_pct",
  "min_edge_cost_ratio",
  "crisis_exposure_mult",
  "leak_ret5d_threshold",
  "max_sector_pct",
  "max_group_pct",
]);
export type LimitKey = z.infer<typeof LimitKey>;

export const LimitValue = z.object({ key: LimitKey, value: z.number() });
export type LimitValue = z.infer<typeof LimitValue>;

export const LimitVersion = z.object({
  version: z.number().int().positive(),
  status: z.enum(["proposed", "active", "superseded", "rejected"]),
  reason: z.string().min(1),
  created_by: z.string(),
  created_by_name: z.string(),
  created_at: IsoDateTime,
  approved_by: z.string().nullable(),
  approved_by_name: z.string().nullable(),
  approved_at: IsoDateTime.nullable(),
  decision_comment: z.string().nullable(),
  effective_from: IsoDateTime.nullable(),
  values: z.array(LimitValue),
});
export type LimitVersion = z.infer<typeof LimitVersion>;

export const LimitProposalInput = z.object({
  changes: z.array(LimitValue).min(1, "En az bir değişiklik"),
  reason: z.string().trim().min(10, "Gerekçe en az 10 karakter").max(500),
});
export type LimitProposalInput = z.infer<typeof LimitProposalInput>;

export const LimitDecisionInput = z.object({
  decision: z.enum(["approve", "reject"]),
  comment: z.string().trim().min(1, "Yorum zorunludur").max(500),
});
export type LimitDecisionInput = z.infer<typeof LimitDecisionInput>;

/** Canonical v1 limits (_KANONIK-KARARLAR, 06 §9). */
export const LIMITS_V1: readonly LimitValue[] = [
  { key: "risk_per_trade_pct", value: 0.005 },
  { key: "max_position_pct", value: 0.1 },
  { key: "max_concurrent_positions", value: 10 },
  { key: "target_concurrent_positions", value: 8 },
  { key: "max_adv_share", value: 0.01 },
  { key: "price_band_pct", value: 0.02 },
  { key: "daily_loss_halt_pct", value: -0.01 },
  { key: "kill_drawdown_pct", value: -0.05 },
  { key: "min_edge_cost_ratio", value: 2 },
  { key: "crisis_exposure_mult", value: 0.5 },
  { key: "leak_ret5d_threshold", value: 0.08 },
  { key: "max_sector_pct", value: 0.25 },
  { key: "max_group_pct", value: 0.2 },
];

export const LIMIT_META: Readonly<Record<LimitKey, { label_tr: string; unit: "pct" | "count" | "ratio" | "mult"; rule: string }>> = {
  risk_per_trade_pct: { label_tr: "İşlem başına risk", unit: "pct", rule: "R07" },
  max_position_pct: { label_tr: "Pozisyon tavanı", unit: "pct", rule: "R07" },
  max_concurrent_positions: { label_tr: "En çok eşzamanlı pozisyon", unit: "count", rule: "R08" },
  target_concurrent_positions: { label_tr: "Hedef eşzamanlı pozisyon", unit: "count", rule: "R08" },
  max_adv_share: { label_tr: "Günlük hacim payı tavanı", unit: "pct", rule: "R07" },
  price_band_pct: { label_tr: "Fiyat bandı", unit: "pct", rule: "R09" },
  daily_loss_halt_pct: { label_tr: "Günlük zarar durdurması", unit: "pct", rule: "R02" },
  kill_drawdown_pct: { label_tr: "Kill switch (zirveden düşüş)", unit: "pct", rule: "R01" },
  min_edge_cost_ratio: { label_tr: "Avantaj / maliyet alt sınırı", unit: "ratio", rule: "R06" },
  crisis_exposure_mult: { label_tr: "Kriz maruziyet çarpanı", unit: "mult", rule: "R10" },
  leak_ret5d_threshold: { label_tr: "Sızıntı eşiği (5 seans)", unit: "pct", rule: "E*" },
  max_sector_pct: { label_tr: "Sektör tavanı", unit: "pct", rule: "R08" },
  max_group_pct: { label_tr: "Grup tavanı", unit: "pct", rule: "R08" },
};

/* ── Admin (04 §11–12, 09 §5, §8) ─────────────────────────────────────── */
export const RestrictedKind = z.enum([
  "spk_tedbir",
  "vbts_brut_takas",
  "vbts_aciga_satis",
  "vbts_kredili_islem",
  "vbts_tek_fiyat",
  "trading_halt",
  "team_insider",
  "other",
]);
export type RestrictedKind = z.infer<typeof RestrictedKind>;

export const RestrictedSecurity = z.object({
  id: z.string(),
  ticker: z.string(),
  kind: RestrictedKind,
  source_ref: z.string().nullable(),
  added_at: IsoDateTime,
  added_by: z.string(),
  removal_requested_by: z.string().nullable(),
});
export type RestrictedSecurity = z.infer<typeof RestrictedSecurity>;

export const UniverseEntry = z.object({
  ticker: z.string(),
  company_name: z.string(),
  sector: z.string(),
  group: z.string().nullable(),
  free_float_pct: z.number(),
  adv20_try: z.number(),
  in_universe: z.boolean(),
});
export type UniverseEntry = z.infer<typeof UniverseEntry>;

export const LiveArmState = z.object({
  config_live: z.boolean(),
  env_enabled: z.boolean(),
  ui_armed_by: z.string().nullable(),
  ui_confirmed_by: z.string().nullable(),
  armed: z.boolean(),
  expires_at: IsoDateTime.nullable(),
});
export type LiveArmState = z.infer<typeof LiveArmState>;
