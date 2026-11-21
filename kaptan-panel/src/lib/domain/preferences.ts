import { z } from "zod";
import { IsoDate, IsoDateTime } from "./common";

/**
 * Personal settings of one person: Tatil modu (pause), which alert goes where and the quiet hours, and
 * "Şimdi yedek al". Backend: kaptan.api.routers.preferences, kaptan.domain.schemas.preferences.
 */
export const ALERT_TOPICS = ["suggestion", "part_down", "watched", "price", "weekly"] as const;
export const AlertTopic = z.enum(ALERT_TOPICS);
export type AlertTopic = z.infer<typeof AlertTopic>;

/** Where one kind of alert goes: the phone and e-mail together, and this computer. */
export const KindChoice = z.object({ phone: z.boolean(), desktop: z.boolean() });
export type KindChoice = z.infer<typeof KindChoice>;

const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");

/** Quiet hours in Istanbul time: messages wait and go out at `end`. */
export const QuietHours = z.object({ on: z.boolean(), start: Clock, end: Clock });
export type QuietHours = z.infer<typeof QuietHours>;

export const AlertPrefs = z.object({
  kinds: z.object({
    suggestion: KindChoice,
    part_down: KindChoice,
    watched: KindChoice,
    price: KindChoice,
    weekly: KindChoice,
  }),
  quiet: QuietHours,
  /** Companies whose suggestions and disclosures tell nobody outside the app (price alerts you made still go). */
  muted: z.array(z.string()),
});
export type AlertPrefs = z.infer<typeof AlertPrefs>;

/** Tatil modu: while `active`, disclosures are read and stored but no suggestion is made. */
export const Pause = z.object({ active: z.boolean(), until: IsoDateTime.nullable(), since: IsoDateTime.nullable() });
export type Pause = z.infer<typeof Pause>;

export const Preferences = z.object({ pause: Pause, alerts: AlertPrefs });
export type Preferences = z.infer<typeof Preferences>;

/** POST /me/pause: for `days` days from now, or until the start of `until` (the first day KAPtan works again). */
export type PauseInput = { days: number } | { until: string };
export const PauseUntil = IsoDate;

/** GET /me/backup. `state`: idle, waiting (asked, not picked up yet) or running. */
export const BackupStatus = z.object({
  state: z.enum(["idle", "waiting", "running"]),
  last_at: IsoDateTime.nullable(),
  /** Result of the latest attempt: null = no attempt yet. */
  last_ok: z.boolean().nullable(),
  requested_at: IsoDateTime.nullable(),
  /** The folder on this computer, when the install says it. */
  folder: z.string().nullable(),
  message_tr: z.string(),
});
export type BackupStatus = z.infer<typeof BackupStatus>;

/** POST /auth/password: how many other devices were signed out. */
export const PasswordChanged = z.object({ signed_out_others: z.number().int().nonnegative() });
export type PasswordChanged = z.infer<typeof PasswordChanged>;
