import type { EventType } from "./common";
import type { SubjectRoute } from "./disclosure";
import type { EvalClass } from "./reports";

/** Turkish labels for event codes. FILTER ↔ X, IGNORE ↔ O (FRONTEND-SPEC §9 Ç-2). */
export const EVENT_LABEL: Readonly<Record<EventType, { code: string; tr: string }>> = {
  E1: { code: "E1", tr: "Pay geri alım işlemi" },
  E2: { code: "E2", tr: "Yönetici / ana ortak alımı" },
  E3: { code: "E3", tr: "Yeni iş ilişkisi / ihale" },
  E4: { code: "E4", tr: "Finansal sonuç" },
  FILTER: { code: "X", tr: "Filtre / kaçınma" },
  IGNORE: { code: "O", tr: "Diğer" },
};

export function evalClassOf(t: EventType): EvalClass {
  if (t === "FILTER") return "X";
  if (t === "IGNORE") return "O";
  return t;
}

export function routeLabel(route: SubjectRoute): string {
  if (route === "noise") return "Devre kesici · elendi";
  if (route === "archive_only") return "Arşivlendi";
  if (route === "llm") return "LLM'e gitti";
  if (route.startsWith("avoid:")) return "Kaçınma filtresi";
  return `${route} adayı`;
}

export const STRENGTH_LABEL = {
  strong: "Güçlü",
  moderate: "Orta",
  weak: "Zayıf",
  insufficient: "Yetersiz",
} as const;
