import { z } from "zod";
import { IsoDateTime } from "./common";
import { Role, Signature } from "./user";

/* ── Audit log: hash chain (07 §9 audit_log, 09 §7) ───────────────────── */
/**
 * Every step (agent outputs, signatures, the risk monitor) is appended to one hash chain.
 * /denetim shows it as a plain timeline and walks the chain on "Defteri doğrula" (SPEC §2.3).
 */
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

/** GET /audit — read-only slices of the chain for embedded views (Portföy risk log, Tayfa, Neden). */
export const AuditQuery = z.object({
  entity: z.string().optional(),
  actor: z.string().optional(),
  action: z.string().optional(),
  from: z.string().optional(),
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
});
export type AuditStatus = z.infer<typeof AuditStatus>;

/** GET /settings/config: read-only version labels, models and the fallback chain (04 §11–12, 09 §8). */
export const ConfigView = z.object({
  execution_mode: z.enum(["paper", "personal", "live"]),
  strategy_versions: z.array(z.object({ id: z.string(), frozen_at: IsoDateTime, scope_tr: z.string() })),
  rules_version: z.string(),
  rules_hash: z.string(),
  prompt_manifest_hash: z.string(),
  config_hash: z.string(),
  models: z.array(z.object({ role_tr: z.string(), model_id: z.string() })),
  /** _KANONIK Revizyon 3: Flash-Lite ⇄ Groq gpt-oss → Azure → Ollama → HOLD. */
  fallback_chain: z.array(z.object({ provider: z.string(), model_id: z.string(), note_tr: z.string() })),
  kap_poll_seconds: z.number().int().positive(),
  approval_deadline_tr: z.string(),
  demo_mode: z.boolean(),
});
export type ConfigView = z.infer<typeof ConfigView>;

/* ── Limits (07 limit_versions; canonical v1 seed; personal preferences) ─ */
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

/**
 * A limits version (07 limit_versions). Changing a limit takes two signatures: the Yönetici
 * proposes with a reason (1/2), a different person — the Risk Sorumlusu — approves (2/2);
 * only then the new version becomes active and the old one is superseded.
 */
export const LimitVersion = z.object({
  version: z.number().int().positive(),
  status: z.enum(["proposed", "active", "superseded", "rejected"]),
  reason: z.string().min(1),
  created_at: IsoDateTime,
  effective_from: IsoDateTime.nullable(),
  values: z.array(LimitValue),
  proposed_by: Signature,
  decided_by: Signature.nullable(),
});
export type LimitVersion = z.infer<typeof LimitVersion>;

/** GET /limits: the active set, the one waiting for its second signature, and the history. */
export const LimitsView = z.object({
  active: LimitVersion,
  pending: LimitVersion.nullable(),
  history: z.array(LimitVersion),
});
export type LimitsView = z.infer<typeof LimitsView>;

/** POST /limits/proposals: one limit, its new value and why. */
export const LimitProposalInput = z.object({
  key: LimitKey,
  value: z.number().finite(),
  reason: z.string().trim().min(10, "Gerekçe en az 10 harf olmalı").max(500),
});
export type LimitProposalInput = z.infer<typeof LimitProposalInput>;

/** POST /limits/proposals/{version}/decision. */
export const LimitDecisionInput = z.object({
  decision: z.enum(["approve", "reject"]),
  comment: z.string().trim().max(500).default(""),
});
export type LimitDecisionInput = z.input<typeof LimitDecisionInput>;

/** Canonical v1 limits (_KANONIK-KARARLAR, 06 §9): the ceiling for every personal preference. */
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

/**
 * `stricter`: which direction tightens the limit. "lower" = a smaller number is stricter
 * (risk per trade); "higher" = a larger number is stricter (edge/cost ≥ 2, or the −1% daily
 * halt moved towards 0).
 */
export const LIMIT_META: Readonly<
  Record<LimitKey, { label_tr: string; unit: "pct" | "count" | "ratio" | "mult"; rule: string; stricter: "lower" | "higher" }>
> = {
  risk_per_trade_pct: { label_tr: "İşlem başına risk", unit: "pct", rule: "R07", stricter: "lower" },
  max_position_pct: { label_tr: "Pozisyon tavanı", unit: "pct", rule: "R07", stricter: "lower" },
  max_concurrent_positions: { label_tr: "En çok eşzamanlı pozisyon", unit: "count", rule: "R08", stricter: "lower" },
  target_concurrent_positions: { label_tr: "Hedef eşzamanlı pozisyon", unit: "count", rule: "R08", stricter: "lower" },
  max_adv_share: { label_tr: "Günlük hacim payı tavanı", unit: "pct", rule: "R07", stricter: "lower" },
  price_band_pct: { label_tr: "Fiyat bandı", unit: "pct", rule: "R09", stricter: "lower" },
  daily_loss_halt_pct: { label_tr: "Günlük zarar durdurması", unit: "pct", rule: "R02", stricter: "higher" },
  kill_drawdown_pct: { label_tr: "Kill switch (zirveden düşüş)", unit: "pct", rule: "R01", stricter: "higher" },
  min_edge_cost_ratio: { label_tr: "Avantaj / maliyet alt sınırı", unit: "ratio", rule: "R06", stricter: "higher" },
  crisis_exposure_mult: { label_tr: "Kriz maruziyet çarpanı", unit: "mult", rule: "R10", stricter: "lower" },
  leak_ret5d_threshold: { label_tr: "Sızıntı eşiği (5 seans)", unit: "pct", rule: "E*", stricter: "lower" },
  max_sector_pct: { label_tr: "Sektör tavanı", unit: "pct", rule: "R08", stricter: "lower" },
  max_group_pct: { label_tr: "Grup tavanı", unit: "pct", rule: "R08", stricter: "lower" },
};

/**
 * Why a set of limits is not allowed (empty = fine). Personal preferences may only tighten
 * the canonical limits, never loosen them; counts are whole numbers ≥ 1; signs are kept; the
 * target position count may not exceed the maximum.
 */
export function limitViolations(values: readonly LimitValue[]): string[] {
  const out: string[] = [];
  const byKey = new Map(values.map((v) => [v.key, v.value]));
  for (const canon of LIMITS_V1) {
    const v = byKey.get(canon.key);
    const meta = LIMIT_META[canon.key];
    if (v === undefined || !Number.isFinite(v)) {
      out.push(`${meta.label_tr}: değer eksik.`);
      continue;
    }
    if (meta.unit === "count" && (!Number.isInteger(v) || v < 1)) out.push(`${meta.label_tr}: en az 1 olan bir tam sayı olmalı.`);
    if (Math.sign(v) !== Math.sign(canon.value)) out.push(`${meta.label_tr}: işareti kanonik değerle aynı kalmalı.`);
    const looser = meta.stricter === "lower" ? v > canon.value : v < canon.value;
    if (looser) out.push(`${meta.label_tr}: kanonik sınırdan gevşek olamaz (${meta.rule}).`);
  }
  const target = byKey.get("target_concurrent_positions");
  const max = byKey.get("max_concurrent_positions");
  if (target !== undefined && max !== undefined && target > max) out.push("Hedef eşzamanlı pozisyon, en çok eşzamanlı pozisyondan büyük olamaz.");
  return out;
}

/* ── Settings: universe, restricted list, live mode (06 §2, R13, R12) ─── */
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

/**
 * R13 restricted list. `team_insider` is your own conflict (you, a relative or a friend works
 * there, or you heard something non-public; 12 §7/4). The SPK/VBTS kinds come from the
 * nightly restrictions sync. You add and remove your own entries directly; synced entries
 * cannot be removed by hand.
 */
export const RestrictedSecurity = z.object({
  id: z.string(),
  ticker: z.string(),
  kind: RestrictedKind,
  source_ref: z.string().nullable(),
  added_at: IsoDateTime,
  /** "user:sen" or "system:restrictions_sync". */
  added_by: z.string(),
});
export type RestrictedSecurity = z.infer<typeof RestrictedSecurity>;

export const UniverseEntry = z.object({
  ticker: z.string(),
  company_name: z.string(),
  sector: z.string(),
  group: z.string().nullable(),
  free_float_pct: z.number(),
  adv20_try: z.number(),
  /** Passes the universe rules (06 §2, S-U); decided by code, not by you. */
  in_universe: z.boolean(),
  /** On your watchlist: Köprü and the morning brief list it first. */
  watched: z.boolean(),
});
export type UniverseEntry = z.infer<typeof UniverseEntry>;

/**
 * Live mode's three keys (_KANONIK, R12): config `execution.mode: live`, env
 * `KAPTAN_LIVE_ENABLED=true`, and your own UI key for the session. All three or nothing; in
 * the course build and in mock mode the first two are always off, so live mode never arms.
 */
export const LiveArmState = z.object({
  config_live: z.boolean(),
  env_enabled: z.boolean(),
  ui_key: z.boolean(),
  armed: z.boolean(),
  expires_at: IsoDateTime.nullable(),
});
export type LiveArmState = z.infer<typeof LiveArmState>;

/* ── Notes on a proposal (Analist: "okur, not ekler") ─────────────────── */
export const ProposalNote = z.object({
  id: z.string(),
  proposal_id: z.string(),
  uid: z.string(),
  name: z.string(),
  role: Role,
  body: z.string().min(1).max(500),
  created_at: IsoDateTime,
});
export type ProposalNote = z.infer<typeof ProposalNote>;

export const NoteInput = z.object({ body: z.string().trim().min(3, "Not en az 3 harf olmalı").max(500, "Not en fazla 500 harf") });

/** GET /audit: one page of the chain, newest first. */
export const AuditPage = z.object({
  items: z.array(AuditEntry),
  total: z.number().int().nonnegative(),
  /** Length of the whole chain (what "Defteri doğrula" walks). */
  length: z.number().int().nonnegative(),
  /** Demo: a record was changed behind the chain's back (Ayarlar → Kurcalama testi). */
  tamper_on: z.boolean(),
});
export type AuditPage = z.infer<typeof AuditPage>;

export const AuditListQuery = z.object({
  scope: z.enum(["today", "all"]).default("today"),
  q: z.string().trim().max(100).optional(),
  limit: z.number().int().positive().max(500).default(200),
});
export type AuditListQuery = z.input<typeof AuditListQuery>;
