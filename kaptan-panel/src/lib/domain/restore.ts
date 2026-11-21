import { z } from "zod";
import { IsoDateTime } from "./common";

/**
 * GET /me/backup/list: the backups in the backup folder with their age, a warning when the newest is old, and the
 * safe steps to go back to one. The restore itself is only ever done by `geri-yukle.ps1`, never from the app.
 */
export const BackupFile = z.object({
  name: z.string(),
  at: IsoDateTime,
  size_bytes: z.number().int().nonnegative(),
  age_days: z.number().int().nonnegative(),
});
export type BackupFile = z.infer<typeof BackupFile>;

export const BackupList = z.object({
  /** False when the app cannot see the folder (say so; never show an empty list as "no backups"). */
  available: z.boolean(),
  folder: z.string().nullable(),
  last_at: IsoDateTime.nullable(),
  age_days: z.number().int().nonnegative().nullable(),
  /** The newest backup is older than the warning limit, or there is none. */
  stale: z.boolean(),
  warning_tr: z.string().nullable(),
  files: z.array(BackupFile),
  steps_tr: z.array(z.string()),
});
export type BackupList = z.infer<typeof BackupList>;
