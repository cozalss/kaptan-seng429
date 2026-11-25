import { z } from "zod";
import { IsoDateTime } from "./common";
import { Preferences } from "./preferences";

/**
 * Telegram (Ayarlar · Telegram): follow KAP from the phone. Backend: kaptan.telegram.service,
 * kaptan.api.routers.telegram, kaptan.domain.schemas.telegram. The bot token never comes back.
 */
export const TelegramLevel = z.enum(["less", "normal", "more"]);
export type TelegramLevel = z.infer<typeof TelegramLevel>;

/** GET /me/telegram. */
export const TelegramStatus = z.object({
  /** A bot token is set (from the install or pasted here). */
  configured: z.boolean(),
  /** The token comes from the install (.env) and cannot be changed here. */
  token_from_env: z.boolean(),
  bot_username: z.string().nullable(),
  /** A phone is connected. */
  paired: z.boolean(),
  /** A connect link was made and has not expired or been used. */
  pairing_open: z.boolean(),
  pairing_expires_at: IsoDateTime.nullable(),
  level: TelegramLevel,
  /** Most instant messages a day. */
  daily_cap: z.number().int().min(1).max(50),
  /** /sessiz: no instant messages until this time. */
  silent_until: IsoDateTime.nullable(),
  last_sent_at: IsoDateTime.nullable(),
  /** Bulut takibi: the Cloudflare Worker follows KAP while this computer is off (CLOUD_WATCHER_URL is set). */
  cloud_on: z.boolean(),
  /** The last time this computer told the Worker its tickers. */
  cloud_synced_at: IsoDateTime.nullable(),
  /** The last message the Worker sent to the phone. */
  cloud_message_at: IsoDateTime.nullable(),
  /** Whether the Worker can reach KAP from Cloudflare's addresses; null while the cloud is off. */
  cloud_kap: z.enum(["ok", "blocked", "error", "unknown"]).nullable(),
  /** The last sync failed (the Worker did not answer). */
  cloud_error: z.boolean(),
});
export type TelegramStatus = z.infer<typeof TelegramStatus>;

/** PUT /me/telegram: any of the three. */
export type TelegramInput = { token?: string; level?: TelegramLevel; daily_cap?: number };

/** POST /me/telegram/pair: the one-time link to tap on the phone. */
export const TelegramPair = z.object({ pair_link: z.string(), expires_at: IsoDateTime });
export type TelegramPair = z.infer<typeof TelegramPair>;

/** POST /me/settings/reset ("Ayarları sıfırla"): the settings as they are now, back at their defaults. */
export const SettingsReset = z.object({ preferences: Preferences, telegram: TelegramStatus });
export type SettingsReset = z.infer<typeof SettingsReset>;
