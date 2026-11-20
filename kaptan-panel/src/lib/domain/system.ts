import { z } from "zod";
import { IsoDateTime } from "./common";

/**
 * GET /system/status: is KAPtan actually working? What the workers last did, not whether a process
 * is alive (backend/src/kaptan/ops/system_status.py). `message` is `problems[0].message`.
 */
export const SystemProblem = z.object({ code: z.string(), message: z.string() });
export type SystemProblem = z.infer<typeof SystemProblem>;

const age = z.number().nonnegative().nullable();

export const SystemStatus = z.object({
  /** KAPtan is reading KAP right now. */
  reading: z.boolean(),
  /** The one sentence for the person; null = nothing to say. */
  message: z.string().nullable(),
  checked_at: IsoDateTime,
  ingest: z.object({ ok: z.boolean(), last_poll_at: IsoDateTime.nullable(), age_s: age }),
  agents: z.object({ ok: z.boolean(), last_run_at: IsoDateTime.nullable(), age_s: age }),
  scheduler: z.object({ ok: z.boolean() }),
  backup: z.object({ ok: z.boolean(), last_at: IsoDateTime.nullable(), age_h: age }),
  /** Phone / e-mail alerts on this computer (an older backend leaves it out). */
  alerts: z
    .object({
      ok: z.boolean(),
      ntfy: z.boolean(),
      email: z.boolean(),
      last_sent_at: IsoDateTime.nullable(),
    })
    .optional(),
  /** Most important first. */
  problems: z.array(SystemProblem),
});
export type SystemStatus = z.infer<typeof SystemStatus>;

/**
 * GET /me/alerts, POST /me/alerts/test: which phone and e-mail channels are set up on this
 * computer. Never the topic or the address.
 */
export const AlertSettings = z.object({
  ntfy: z.boolean(),
  email: z.boolean(),
  last_sent_at: IsoDateTime.nullable(),
  last_error_tr: z.string().nullable(),
});
export type AlertSettings = z.infer<typeof AlertSettings>;
