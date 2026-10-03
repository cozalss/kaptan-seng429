import { z } from "zod";
import { IsoDate, IsoDateTime } from "./common";

/**
 * The personal-money stages (12 §1, _KANONIK "Kişisel para planı"):
 * Kanıt → Paper → Gölge → Küçük gerçek para. Each stage has go criteria; the panel always
 * shows which stage you are in and how far the current one is from its go criteria.
 * (Aşama 4, kademeli büyütme, is outside the panel's scope.)
 */
export const StageId = z.enum(["evidence", "paper", "shadow", "small_real"]);
export type StageId = z.infer<typeof StageId>;

export const StageCriterion = z.object({
  id: z.string(),
  label_tr: z.string(),
  /** Display strings, already formatted ("63 / 90 gün", "%−3,1"). */
  current_tr: z.string(),
  target_tr: z.string(),
  /** 0…1 for a progress bar; null when the criterion is yes/no. */
  progress: z.number().min(0).max(1).nullable(),
  met: z.boolean(),
  /** Kanonik (canon) or kendi kararım [K] (12 §1). */
  source: z.enum(["kanonik", "kisisel"]),
});
export type StageCriterion = z.infer<typeof StageCriterion>;

export const StageInfo = z.object({
  id: StageId,
  n: z.number().int().min(0).max(3),
  label_tr: z.string(),
  window_tr: z.string(),
  summary_tr: z.string(),
  status: z.enum(["done", "current", "next", "locked"]),
});
export type StageInfo = z.infer<typeof StageInfo>;

/** GET /personal/stage. */
export const PersonalStageStatus = z.object({
  current: StageId,
  started_on: IsoDate,
  stages: z.array(StageInfo).length(4),
  /** Go criteria of the current stage (what it takes to move on). */
  criteria: z.array(StageCriterion),
  /** What the current stage means for an approved proposal's ticket. */
  ticket_mode_tr: z.string(),
  as_of: IsoDateTime,
  is_sample: z.boolean(),
});
export type PersonalStageStatus = z.infer<typeof PersonalStageStatus>;
