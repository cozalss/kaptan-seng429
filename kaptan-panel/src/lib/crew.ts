import type { AgentName, CrewAgent } from "@/lib/domain";

/**
 * The crew registry (Tayfa): the same eight members, names, order and portraits as the
 * landing's "Bölüm 2 · Tayfa" (`kaptan-landing/src/data/agents.js`, KAPTAN-BRIEF §0). Facts
 * only — no invented metrics here; live numbers come from `api.crew()`.
 *
 * Portraits are tracked assets in `public/crew/` (copied from the landing's generated set,
 * 3:4, 400/600/800 px, AVIF → WebP → JPEG). `public/crew/` is not touched by
 * `scripts/sync-landing.mjs`.
 */
export type CrewKind = "llm" | "rule";

export interface CrewMember {
  /** URL slug, as on the landing (`#ajan-<id>`) and in `/tayfa/<id>`. */
  id: string;
  /** Graph node key (05), joins the registry to traces and `api.crew()`. */
  agent: CrewAgent;
  /** "01" … "08", pipeline order. */
  number: string;
  name: string;
  kind: CrewKind;
  kindLabel: string;
  /** "Girdi: … · Çıktı: …" */
  meta: string;
  /** What it does, one or two sentences. */
  role: string;
  /** What it never does. */
  notDoes: string;
  /** Base path without width/extension: `/crew/ajan-1` → `/crew/ajan-1-400.avif`. */
  portraitBase: string;
}

export const CREW_KIND_LABEL: Readonly<Record<CrewKind, string>> = { llm: "LLM ajanı", rule: "Deterministik" };

const LIST: ReadonlyArray<Omit<CrewMember, "number" | "kindLabel" | "portraitBase">> = [
  {
    id: "siniflandirici",
    agent: "classifier",
    kind: "llm",
    name: "Sınıflandırıcı",
    meta: "Girdi: bildirim · Çıktı: E1–E4 / filtre / diğer",
    role: "Her bildirimin türünü bulur: pay geri alımı, yönetici ya da ana ortak alımı, yeni iş ilişkisi, finansal sonuç — ya da hiçbiri. 200 kilitli test bildirimiyle ölçülür; hedef macro-F1 ≥ 0,85.",
    notDoes: "Al ya da sat demez; yalnızca etiketler.",
  },
  {
    id: "okuyucu",
    agent: "reader",
    kind: "llm",
    name: "Okuyucu",
    meta: "Girdi: bildirim metni · Çıktı: tutar, karşı taraf, süre",
    role: "Sınıflandırılan bildirimin serbest metnini yapılandırılmış alanlara çevirir: tutar, karşı taraf, süre. Kural motorunun ihtiyaç duyduğu her değer buradan gelir.",
    notDoes: "Oran hesaplamaz; hesabı birleştirme düğümü yapar.",
  },
  {
    id: "onemlilik",
    agent: "materiality",
    kind: "llm",
    name: "Önemlilik",
    meta: "Girdi: şirket · Çıktı: finansallar, piyasa değeri",
    role: "Bildirimdeki tutarın şirket için ne kadar büyük olduğunu tartmak üzere şirketin finansallarını ve piyasa değerini getirir. Oranları birleştirme düğümü hesaplar; örneğin E3'te yıllıklandırılmış tutarın yıllık gelire oranı.",
    notDoes: "Eşiğe kendisi karar vermez.",
  },
  {
    id: "kanit",
    agent: "evidence",
    kind: "llm",
    name: "Kanıt",
    meta: "Girdi: olay · Çıktı: benzer geçmiş olaylar",
    role: "Olay hafızasından benzer geçmiş olayları seçer — o olayların sonraki getirilerini görmeden. Seçilen olayların istatistiğini kod hesaplar; seçim, sonuca bakılarak yapılamaz.",
    notDoes: "Getiri görmez, istatistik hesaplamaz.",
  },
  {
    id: "supheci",
    agent: "skeptic",
    kind: "llm",
    name: "Şüpheci",
    meta: "Girdi: taslak öneri · Çıktı: küçült / veto",
    role: "Önerideki açıkları arar: bildirimden önce fiyata yansımış bir sızıntı, abartılı bir dil. Bir açık bulduğunda önerinin büyüklüğünü küçültür ya da öneriyi veto eder.",
    notDoes: "Bir öneriyi büyütemez.",
  },
  {
    id: "uyum",
    agent: "compliance",
    kind: "llm",
    name: "Uyum",
    meta: "Girdi: bildirim, şirket · Çıktı: tedbir ve injection bayrağı",
    role: "SPK tedbirlerini denetler ve bildirim metnine gizlenmiş talimatları (prompt-injection) yakalar. Ölçüt açık: kötü niyetli bir bildirimden çıkan emir sayısı 0.",
    notDoes: "Kural esnetmez; şüphede öneriyi durdurur.",
  },
  {
    id: "kural-motoru",
    agent: "rule_engine",
    kind: "rule",
    name: "Kural Motoru",
    meta: "Girdi: yapılandırılmış kanıt · Çıktı: E1–E4 kararı",
    role: "E1–E4 kurallarını yazılı eşiklerle uygular; örneğin E1 için 10 seansta sermayenin en az %0,25'i. Aynı girdi her zaman aynı kararı verir.",
    notDoes: "Yorum yapmaz, LLM çağırmaz.",
  },
  {
    id: "risk-kapisi",
    agent: "risk_gate",
    kind: "rule",
    name: "Risk Kapısı",
    meta: "Girdi: öneri · Çıktı: aynen / küçült / reddet",
    role: "16 kuraldan (R01–R16) geçirir: işlem başına %0,5 risk, pozisyon en fazla %10; günlük −%1'de yeni emir durur, zirveden −%5'te kill switch açık emirleri iptal eder.",
    notDoes: "Bir öneriyi asla büyütmez; pozisyon satmaz.",
  },
];

export const CREW: readonly CrewMember[] = Object.freeze(
  LIST.map((m, i) =>
    Object.freeze({
      ...m,
      number: String(i + 1).padStart(2, "0"),
      kindLabel: CREW_KIND_LABEL[m.kind],
      portraitBase: `/crew/ajan-${i + 1}`,
    }),
  ),
);

export const PORTRAIT_WIDTHS = [400, 600, 800] as const;
/** Intrinsic aspect of every portrait (3:4). */
export const PORTRAIT_RATIO = { w: 3, h: 4 } as const;

export function crewBySlug(slug: string): CrewMember | null {
  return CREW.find((m) => m.id === slug) ?? null;
}

export function crewByAgent(agent: CrewAgent): CrewMember {
  const found = CREW.find((m) => m.agent === agent);
  if (!found) throw new RangeError(`crewByAgent: unknown agent "${agent}"`);
  return found;
}

/** `srcset` for one format: "/crew/ajan-1-400.avif 400w, …". */
export function portraitSrcSet(member: Pick<CrewMember, "portraitBase">, ext: "avif" | "webp" | "jpg"): string {
  return PORTRAIT_WIDTHS.map((w) => `${member.portraitBase}-${w}.${ext} ${w}w`).join(", ");
}

/** Fallback `src` (JPEG, given width). */
export function portraitSrc(member: Pick<CrewMember, "portraitBase">, width: (typeof PORTRAIT_WIDTHS)[number] = 400): string {
  return `${member.portraitBase}-${width}.jpg`;
}

/* ── Model fallback chain (05 §models.yaml, _KANONIK Revizyon 3) ──────── */
/**
 * Primary → fallbacks → HOLD. Configuration, not run data — the trace's `model_id` shows
 * which step answered. Classifier and Skeptic run on Groq first; the rest on Gemini Flash-Lite.
 */
const GEMINI_FIRST = ["Gemini", "Groq", "Azure", "Ollama", "HOLD"] as const;
const GROQ_FIRST = ["Groq", "Gemini", "Azure", "Ollama", "HOLD"] as const;
export const MODEL_CHAIN: Readonly<Record<AgentName, readonly string[]>> = {
  classifier: GROQ_FIRST,
  reader: GEMINI_FIRST,
  materiality: GEMINI_FIRST,
  evidence: GEMINI_FIRST,
  skeptic: GROQ_FIRST,
  compliance: GEMINI_FIRST,
};

/** Full provider names for the chain legend. */
export const PROVIDER_LABEL: Readonly<Record<string, string>> = {
  Gemini: "Gemini Flash-Lite",
  Groq: "Groq gpt-oss-120b",
  Azure: "Azure for Students",
  Ollama: "Ollama Qwen (yerel)",
  HOLD: "zincir biterse HOLD",
};
