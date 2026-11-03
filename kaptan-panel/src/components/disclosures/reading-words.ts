import type { ApprovalCard, DisclosureListItem } from "@/lib/domain";
import { fmtInt } from "@/lib/format";
import { possessive } from "@/components/story/turkish";
import { dateLocative } from "@/components/portfolio/param-words";

/**
 * The words of Okunanlar, as pure functions: the day's one sentence, the stages of the funnel and
 * its silhouette, what a disclosure said in plain words, and what KAPtan did with it and why.
 * KAPtan speaks in the first person on this screen: it is the one who read them.
 */
export function readingSentence({ total, useful, day, today }: { total: number; useful: number; day: string; today: string | null }): string {
  const isToday = day === today;
  const when = isToday ? "Bugün" : dateLocative(day);
  if (total === 0) return isToday ? "Bugün henüz duyuru okumadım." : `${when} okunacak duyuru yoktu.`;
  const read = `${when} ${fmtInt(total)} duyuru okudum`;
  if (useful === 0) return isToday ? `${read}; işine yarayacak bir şey çıkmadı.` : `${read}; işine yarayacak bir şey çıkmamıştı.`;
  return `${read}, ${possessive(fmtInt(useful))} işine ${isToday ? "yarayabilir" : "yarayabilirdi"}.`;
}

export interface FunnelCounts {
  total: number;
  noise: number;
  archived: number;
  processed: number;
  useful: number;
}

export interface FunnelStage {
  key: "read" | "real" | "close" | "useful";
  value: number;
  label: string;
}

/** Each stage is what is left after the one before it. Pure. */
export function funnelStages({ total, noise, processed, useful }: FunnelCounts): FunnelStage[] {
  return [
    { key: "read", value: total, label: "okudum" },
    { key: "real", value: Math.max(0, total - noise), label: "gerçek haberdi" },
    { key: "close", value: Math.max(processed, useful), label: "yakından baktım" },
    { key: "useful", value: useful, label: "işine yarayabilir" },
  ];
}

/** A stage this small next to the total would vanish: it stays a thin thread. */
const MIN_THREAD = 1;
/** A stage holds its height for this share of its width, then falls to the next. */
const HOLD = 0.68;

const smooth = (t: number) => t * t * (3 - 2 * t);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The silhouette of the funnel as a CSS polygon on a 0–100 box, standing on the water (y = 100):
 * height follows the count, one equal column per stage, an eased fall between neighbours. A
 * polygon, so the hatch laid over it keeps its pitch at any size.
 */
export function funnelPolygon(values: readonly number[], steps = 12): string {
  const top = Math.max(0, ...values);
  if (top <= 0) return "polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%)";
  const yOf = (v: number) => round2(100 - Math.max(v > 0 ? MIN_THREAD : 0, (v / top) * 100));
  const width = 100 / values.length;
  const points: string[] = [];
  values.forEach((v, i) => {
    const x0 = i * width;
    points.push(`${round2(x0)}% ${yOf(v)}%`);
    const holdX = x0 + width * HOLD;
    points.push(`${round2(holdX)}% ${yOf(v)}%`);
    const next = values[i + 1];
    if (next === undefined) {
      points.push(`100% ${yOf(v)}%`);
      return;
    }
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      points.push(`${round2(holdX + (x0 + width - holdX) * t)}% ${round2(yOf(v) + (yOf(next) - yOf(v)) * smooth(t))}%`);
    }
  });
  return `polygon(${points.join(", ")}, 100% 100%, 0% 100%)`;
}

/** Official subjects in the words a person would use. Checked in order, first match wins. */
const SAID: ReadonlyArray<readonly [RegExp, string]> = [
  [/devre kesici/i, "Hissede işlemler kısa süre durdu."],
  [/genel kurul/i, "Ortaklar toplantısının tarihini duyurdu."],
  [/kar payı|kâr payı/i, "Kâr payı takvimini açıkladı."],
  [/borçlanma aracı/i, "Borç senedi çıkardı."],
  [/pay dışında sermaye piyasası/i, "Daha önce çıkardığı borç senediyle ilgili bilgi verdi."],
  [/yönetim kurulu komite/i, "Şirket içindeki bir kurulu yeniden belirledi."],
  [/genel bilgi formu/i, "Şirket bilgilerini güncelledi."],
  [/kurumsal yönetim/i, "Yönetim kurallarına uyum raporunu yayımladı."],
  [/sorumluluk beyanı/i, "Yöneticiler, mali tabloların doğruluğuna imza attı."],
  [/faaliyet raporu/i, "Son dönemde neler yaptığını anlattı."],
  [/bedelsiz/i, "Ortaklarına ücretsiz yeni hisse verecek."],
  [/bedelli/i, "Yeni hisse satarak para toplayacak."],
  [/tedbir/i, "Borsa bu hisseye tedbir koydu."],
  [/derecelendirme/i, "Kredi notunu açıkladı."],
];

/** What the disclosure said, in plain words: the table, then its summary, then its subject. */
export function plainSaid(d: Pick<DisclosureListItem, "subject" | "summary">): string {
  const known = SAID.find(([pattern]) => pattern.test(d.subject));
  if (known) return known[1];
  return d.summary.trim() || d.subject;
}

const AVOID_WHY: Readonly<Record<string, string>> = {
  "avoid:dilutive_rights": "Elindeki payı küçültebilir. Bu hisseden uzak duruyorum.",
  "avoid:measure": "Borsa bu hisseye tedbir koymuş. Uzak duruyorum.",
  "avoid:bonus_issue": "Bu günlerde fiyat yanıltıcı olur. Bu hisseden uzak duruyorum.",
};

export type CardFate = Pick<ApprovalCard, "status" | "side">;

function cardSentence({ status, side }: CardFate): string {
  const verb = side === "sell" ? "Satmanı" : "Almanı";
  switch (status) {
    case "approved":
      return `${verb} önerdim, onayladın.`;
    case "rejected":
      return `${verb} önerdim, reddettin.`;
    case "expired":
      return `${verb} önerdim; süresi doldu.`;
    case "cancelled":
      return `${verb} önerdim; öneri iptal oldu.`;
    default:
      return `${verb} öneriyorum. Karar senin.`;
  }
}

/** What KAPtan did with it and why, in one or two short sentences. */
export function whatKaptanDid(d: Pick<DisclosureListItem, "is_noise" | "run_id" | "subject_route">, card: CardFate | null): string {
  if (card) return cardSentence(card);
  if (d.is_noise) return "Borsanın otomatik mesajı. Baktım, geçtim.";
  if (d.run_id !== null) return "Yakından baktım; öneri çıkmadı.";
  if (d.subject_route.startsWith("avoid:")) return AVOID_WHY[d.subject_route] ?? "Riskli bir haber. Bu hisseden uzak duruyorum.";
  return "Para kararı gerektirmiyor. Dosyaladım.";
}

/** The disclosure's own page at KAP. A fixture is not a real record and has none. */
export function kapUrl(d: Pick<DisclosureListItem, "disclosure_index" | "ingest_source">): string | null {
  return d.ingest_source === "demo" ? null : `https://www.kap.org.tr/tr/Bildirim/${d.disclosure_index}`;
}
