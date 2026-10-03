import { istanbulMinutes, isTradingDay, ISTANBUL_OFFSET_H } from "@/lib/time";

/**
 * BIST equity session (11 §0, 12 §2): opening auction 09:40–09:55, matching 09:55–10:00,
 * continuous 10:00–18:00, closing session 18:00–18:10.
 */
export type SessionPhase = "closed" | "pre_open" | "opening_auction" | "opening_match" | "continuous" | "closing";

export interface SessionState {
  phase: SessionPhase;
  label: string;
  /** Short line for the top bar, e.g. "Sürekli işlem · 18:00'e kadar". */
  detail: string;
  isOpen: boolean;
}

const t = (h: number, m: number) => h * 60 + m;

export function sessionState(iso: string): SessionState {
  const date = new Date(Date.parse(iso) + ISTANBUL_OFFSET_H * 3600_000).toISOString().slice(0, 10);
  if (!isTradingDay(date)) {
    return { phase: "closed", label: "Piyasa kapalı", detail: "İşlem günü değil", isOpen: false };
  }
  const m = istanbulMinutes(iso);
  if (m < t(9, 40)) return { phase: "pre_open", label: "Seans öncesi", detail: "Açılış emir toplama 09:40'ta", isOpen: false };
  if (m < t(9, 55)) return { phase: "opening_auction", label: "Açılış emir toplama", detail: "09:40–09:55", isOpen: true };
  if (m < t(10, 0)) return { phase: "opening_match", label: "Açılış eşleşmesi", detail: "Sürekli işlem 10:00'da", isOpen: true };
  if (m < t(18, 0)) return { phase: "continuous", label: "Sürekli işlem", detail: "18:00'e kadar", isOpen: true };
  if (m < t(18, 10)) return { phase: "closing", label: "Kapanış seansı", detail: "18:00–18:10", isOpen: true };
  return { phase: "closed", label: "Seans kapandı", detail: "Yarın 09:40", isOpen: false };
}
