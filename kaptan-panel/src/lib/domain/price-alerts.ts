import { z } from "zod";
import { IsoDateTime } from "./common";

/**
 * Price alerts ("bu hisse şu fiyata gelirse haber ver") and the list of messages that really went out.
 * Backend: kaptan.alerts.price, kaptan.alerts.history, kaptan.domain.schemas.price_alerts.
 */
export const PriceDirection = z.enum(["above", "below"]);
export type PriceDirection = z.infer<typeof PriceDirection>;

/** The two presets: this many percent away from the price now. */
export const PRICE_PRESETS = [5, 10] as const;
export const PricePreset = z.union([z.literal(5), z.literal(10)]);

export const PriceAlert = z.object({
  id: z.string(),
  ticker: z.string(),
  name: z.string(),
  direction: PriceDirection,
  /** The price it waits for (₺). */
  level: z.number().positive(),
  /** Set when it was made from a preset ("yüzde 5 yükselirse"). */
  preset_pct: PricePreset.nullable(),
  created_at: IsoDateTime,
  /** Stamped once it fired; it stays in the list until you remove it. */
  triggered_at: IsoDateTime.nullable(),
  triggered_price: z.number().nullable(),
  /** The latest price KAPtan has (about 15 minutes late) and when it was traded; null = none yet. */
  current_price: z.number().nullable(),
  current_at: IsoDateTime.nullable(),
});
export type PriceAlert = z.infer<typeof PriceAlert>;

/** POST /me/price-alerts: either a typed `level` or a `preset_pct`, never both. */
export type PriceAlertInput = { ticker: string; direction: PriceDirection } & ({ level: number } | { preset_pct: 5 | 10 });

/** Desk event `price_alert`: it stays on this computer, so it may name the company. */
export const PriceAlertEvent = z.object({
  id: z.string(),
  ticker: z.string(),
  name: z.string(),
  direction: PriceDirection,
  level: z.number(),
  price: z.number(),
  at: IsoDateTime,
});
export type PriceAlertEvent = z.infer<typeof PriceAlertEvent>;

export const AlertChannel = z.enum(["ntfy", "email", "telegram"]);

/** One message that went out (or failed) on a phone or e-mail channel: when, where and the fixed sentence. */
export const AlertHistoryItem = z.object({
  at: IsoDateTime,
  channel: AlertChannel,
  ok: z.boolean(),
  text: z.string(),
});
export type AlertHistoryItem = z.infer<typeof AlertHistoryItem>;
