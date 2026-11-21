import type {
  PriceAlert,
  PriceAlertInput,
  PriceDirection,
} from "@/lib/domain/price-alerts";
import { fmtDateTime, fmtPrice } from "@/lib/format";
import { parseMoney } from "@/lib/solo/money-input";

/** The ways to set an alert: a preset percent away from the price now, or a typed price. */
export type AlertMode = "up5" | "up10" | "down5" | "down10" | "above" | "below";

export const MODES: ReadonlyArray<{ mode: AlertMode; label: string }> = [
  { mode: "up5", label: "Yüzde 5 yükselirse" },
  { mode: "up10", label: "Yüzde 10 yükselirse" },
  { mode: "down5", label: "Yüzde 5 düşerse" },
  { mode: "down10", label: "Yüzde 10 düşerse" },
  { mode: "above", label: "Şu fiyatın üstüne çıkarsa" },
  { mode: "below", label: "Şu fiyatın altına inerse" },
];

export const isTyped = (mode: AlertMode) =>
  mode === "above" || mode === "below";

/** What an alert waits for, in the person's words: "300,00 TL üstüne çıkarsa" or "Yüzde 5 yükselirse (105,00 TL)". */
export function waitsFor(
  a: Pick<PriceAlert, "direction" | "level" | "preset_pct">,
): string {
  const price = fmtPrice(a.level);
  if (a.preset_pct !== null)
    return `Yüzde ${a.preset_pct} ${a.direction === "above" ? "yükselirse" : "düşerse"} (${price})`;
  return `${price} ${a.direction === "above" ? "üstüne çıkarsa" : "altına inerse"}`;
}

/** One line about the price now and how far it is from the level. */
export function nowLine(a: PriceAlert): string {
  if (a.triggered_at !== null)
    return `${fmtDateTime(a.triggered_at)} tarihinde tetiklendi${a.triggered_price !== null ? `: fiyat ${fmtPrice(a.triggered_price)} oldu` : ""}.`;
  if (a.current_price === null)
    return "Bu hisse için henüz bir fiyatım yok; fiyat gelince bakmaya başlarım.";
  const gap = ((a.level / a.current_price - 1) * 100).toLocaleString("tr-TR", {
    maximumFractionDigits: 1,
  });
  const late =
    a.current_at !== null
      ? ` (${fmtDateTime(a.current_at)}, yaklaşık 15 dakika gecikmeli)`
      : "";
  return `Şimdiki fiyat ${fmtPrice(a.current_price)}${late}. Fiyata uzaklığı yüzde ${gap.replace("-", "−")}.`;
}

export function directionOf(mode: AlertMode): PriceDirection {
  return mode === "up5" || mode === "up10" || mode === "above"
    ? "above"
    : "below";
}

export type Built =
  { ok: true; input: PriceAlertInput } | { ok: false; error: string };

/** The request a filled-in form means, or the one plain line that says what is missing. */
export function buildInput(
  ticker: string,
  mode: AlertMode,
  typed: string,
): Built {
  const code = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,6}$/.test(code))
    return { ok: false, error: "Hisse kodunu yaz (ör. THYAO)." };
  const direction = directionOf(mode);
  if (!isTyped(mode))
    return {
      ok: true,
      input: {
        ticker: code,
        direction,
        preset_pct: mode.endsWith("10") ? 10 : 5,
      },
    };
  const level = parseMoney(typed.trim(), 4);
  if (level === null || level <= 0 || level >= 1_000_000)
    return { ok: false, error: "Bir fiyat yaz (ör. 300 ya da 48,50)." };
  return { ok: true, input: { ticker: code, direction, level } };
}

export const PRICE_ALERTS_LEAD =
  "Bir hisse istediğin fiyata gelince haber veririm. Fiyatlar yaklaşık 15 dakika gecikmelidir. Telefonuna ve e-postana hisse adı ya da fiyat gitmez, yalnızca “bir fiyat uyarın tetiklendi” yazar; adı sadece bu bilgisayardaki bildirimde görürsün.";

export function priceAlertsSentence(
  alerts: readonly PriceAlert[] | null,
): string {
  if (alerts === null) return "Fiyat uyarılarına bakıyorum…";
  const open = alerts.filter((a) => a.triggered_at === null).length;
  if (open === 0) return "Bekleyen bir fiyat uyarın yok.";
  return `${open} fiyat uyarın bekliyor.`;
}
