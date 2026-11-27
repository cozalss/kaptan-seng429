import { z } from "zod";
import { IsoDateTime } from "./common";

/**
 * "Ne öğrendim" (/ogrendiklerim): what KAPtan learned from past disclosures and from its own decisions.
 * Backend: kaptan.learn (report, tuning, calibration), kaptan.api.routers.learning, kaptan.domain.schemas.learning.
 * Every return here is net of the estimated trading cost. The sealed test years (2025-01-01 → 2026-10-31) are
 * never read: the numbers come from 2022–2024 and from KAPtan's own decisions since 2026-11-01.
 */
export const LearningKind = z.enum(["E1", "E2", "E3", "E4"]);
export type LearningKind = z.infer<typeof LearningKind>;

/** Calibration of one kind: how KAPtan's predicted edge compared with what really happened. */
export const LearningCalibration = z.object({
  /** Decisions of this kind whose return has matured (20 borsa günü for E1/E2, 5 for E3/E4). */
  n_matured: z.number().int().min(0),
  /** A correction is used only from this many matured decisions on (30). */
  needed: z.number().int().min(1),
  /** Slope of realised on predicted (1 = right on average); null below 2 matured decisions. */
  slope: z.number().nullable(),
  /** Average realised − predicted, in basis points (1 bp = %0,01); null when nothing matured. */
  bias_bps: z.number().nullable(),
  /** The bounded factor future predicted edges of this kind are multiplied by (1 = no correction). */
  factor: z.number(),
  /** The factor is in use (n_matured ≥ needed). */
  active: z.boolean(),
});
export type LearningCalibration = z.infer<typeof LearningCalibration>;

/** One kind of disclosure in the evidence pool. Returns are fractions (0.004 = %0,4), net of cost. */
export const LearningKindRow = z.object({
  kind: LearningKind,
  label_tr: z.string(),
  n: z.number().int().min(0),
  hit_rate: z.number().min(0).max(1).nullable(),
  mean_net: z.number().nullable(),
  median_net: z.number().nullable(),
  /** The trading days the return is measured over (20 or 5). */
  horizon_days: z.number().int().min(1),
  calibration: LearningCalibration,
});
export type LearningKindRow = z.infer<typeof LearningKindRow>;

export const LearningChangeStatus = z.enum(["applied", "proposed", "reverted"]);
export type LearningChangeStatus = z.infer<typeof LearningChangeStatus>;

/** A rule threshold KAPtan changed (or, with self-learning off, proposed to change). */
export const LearningChange = z.object({
  /** The rules version this change made (Geri al names it). */
  version: z.number().int().min(1),
  rule: z.string(),
  label_tr: z.string(),
  unit: z.enum(["pct", "try"]),
  from_value: z.number(),
  to_value: z.number(),
  at: IsoDateTime,
  status: LearningChangeStatus,
  /** One plain sentence: what changed and what the past test showed. */
  reason_tr: z.string(),
  /** Net return per decision gained in the walk-forward test, basis points, with its 95 % range. */
  gain_bps: z.number(),
  ci_low_bps: z.number(),
  ci_high_bps: z.number(),
  n: z.number().int().min(0),
  /** "Geri al" is offered (an applied change that is still the latest for its rule). */
  can_revert: z.boolean(),
});
export type LearningChange = z.infer<typeof LearningChange>;

/** A threshold the weekly pass looked at and left alone, with the reason. */
export const LearningRejected = z.object({
  rule: z.string(),
  label_tr: z.string(),
  unit: z.enum(["pct", "try"]),
  current: z.number(),
  candidate: z.number().nullable(),
  reason_tr: z.string(),
});
export type LearningRejected = z.infer<typeof LearningRejected>;

/** How the edge estimator was chosen: one walk-forward fold of one kind. */
export const LearningFold = z.object({
  kind: LearningKind,
  /** "2022 → 2023" (chosen here) or "2022–23 → 2024" (checked here). */
  fold: z.string(),
  n_train: z.number().int().min(0),
  n_val: z.number().int().min(0),
  /** Squared error of the chosen estimator ÷ that of the plain mean (below 1 = better); null: no data. */
  error_ratio: z.number().nullable(),
});
export type LearningFold = z.infer<typeof LearningFold>;

/** GET /me/learning. */
export const LearningReport = z.object({
  /** When the last weekly pass ran (null: never yet). */
  generated_at: IsoDateTime.nullable(),
  /** "Kendi kendine öğrenme": on → a change that passes every check is applied; off → only proposed. */
  auto_apply: z.boolean(),
  /** The latest takeaway in one plain sentence (null: nothing learned yet). */
  takeaway_tr: z.string().nullable(),
  /** The edge estimator in use and why, in one plain sentence. */
  estimator_tr: z.string(),
  kinds: z.array(LearningKindRow),
  changes: z.array(LearningChange),
  rejected: z.array(LearningRejected),
  folds: z.array(LearningFold),
});
export type LearningReport = z.infer<typeof LearningReport>;

/** PUT /me/learning/settings. */
export type LearningSettingsInput = { auto_apply: boolean };
