import type { Digest, DigestItem, DigestKind } from "@/lib/domain/digest";
import type { QuietDay } from "@/lib/domain/reports";
import type { SignalTone } from "@/lib/domain/signal";
import { KIND_TITLE } from "@/lib/digest/digest";
import { fmtInt } from "@/lib/format";

/** "KAPtan bugün ne öğrendi": everything here is counted from data the home already has. Pure. */

export interface FunnelStep {
  n: number;
  /** What the number counts, after the number ("duyuru okundu"). */
  label: string;
  /** One short plain reason under the step, or null. */
  why: string | null;
}

/** The day's three steps: read, looked at closely, became a suggestion; each with its plain why. */
export function funnelSteps(q: Pick<QuietDay, "read" | "relevant" | "proposals" | "reasons">): FunnelStep[] {
  const top = q.reasons[0] ?? null;
  return [
    { n: q.read, label: "duyuru okundu", why: q.read === 0 ? "KAP'tan bugün henüz duyuru gelmedi." : "KAP'a bugün düşen bütün duyurular." },
    {
      n: q.relevant,
      label: "tanesine yakından bakıldı",
      why: q.read === 0 ? null : q.relevant === 0 ? "Hiçbiri KAPtan'ın öneri verebileceği türden bir olay değildi." : "Öneri verilebilecek türden görünen olaylar.",
    },
    {
      n: q.proposals,
      label: "öneriye dönüştü",
      why: q.proposals > 0 ? "Ana sayfada kararını bekliyor." : top ? `En sık neden: ${top.reason_tr} (${fmtInt(top.n)}).` : null,
    },
  ];
}

/** The kind, as it reads inside a sentence ("Bugün en çok pay geri alımı vardı"). */
export const KIND_PHRASE: Readonly<Record<DigestKind, string>> = {
  restriction: "SPK tedbiri",
  insider: "yönetici ve ana ortak işlemi",
  contract: "yeni iş ve ihale duyurusu",
  earnings: "finansal sonuç açıklaması",
  dividend: "kâr payı duyurusu",
  capital: "sermaye artırımı ya da azaltımı",
  merger: "birleşme ya da bölünme",
  buyback: "pay geri alımı",
};

export interface KindBar {
  kind: DigestKind;
  title: string;
  total: number;
  /** How many of each tone, so a bar is never told apart by colour alone (the words sit beside it). */
  tones: Readonly<Record<SignalTone, number>>;
}

const NO_TONES: Readonly<Record<SignalTone, number>> = { olumlu: 0, olumsuz: 0, notr: 0, belirsiz: 0 };

/** Today's notable disclosures by kind, biggest first, each with its tone counts. */
export function kindBars(items: readonly DigestItem[]): KindBar[] {
  const by = new Map<DigestKind, KindBar>();
  for (const i of items) {
    const was = by.get(i.kind) ?? { kind: i.kind, title: KIND_TITLE[i.kind], total: 0, tones: NO_TONES };
    by.set(i.kind, { ...was, total: was.total + 1, tones: { ...was.tones, [i.tone]: was.tones[i.tone] + 1 } });
  }
  return [...by.values()].sort((a, b) => b.total - a.total || a.title.localeCompare(b.title, "tr"));
}

/** Two or three plain one-line takeaways, always in the same order for the same data. */
export function takeaways(digest: Pick<Digest, "items"> | null, mine: number | null): string[] {
  const out: string[] = [];
  const items = digest?.items ?? [];
  const top = kindBars(items)[0];
  if (top) out.push(`Bugün en çok ${KIND_PHRASE[top.kind]} vardı (${fmtInt(top.total)}).`);
  if (mine !== null) out.push(mine === 0 ? "Senin hisselerinde önemli bir şey olmadı." : `Senin hisselerinde ${fmtInt(mine)} önemli duyuru var.`);
  const outside = items.filter((i) => i.outside_list).length;
  if (items.length > 0 && outside * 2 > items.length) {
    out.push(`Öne çıkanların ${fmtInt(outside)} tanesi KAPtan'ın öneri vermediği hisselerden.`);
  } else if (items.length > 0) {
    const pos = items.filter((i) => i.tone === "olumlu").length;
    const neg = items.filter((i) => i.tone === "olumsuz").length;
    out.push(`${fmtInt(pos)} olumlu, ${fmtInt(neg)} olumsuz duyuru vardı.`);
  }
  return out.slice(0, 3);
}

/** One sentence over the highlights instead of the same tag on every row. Null when none is outside the list. */
export function outsideSummary(items: readonly Pick<DigestItem, "outside_list">[]): string | null {
  const k = items.filter((i) => i.outside_list).length;
  if (k === 0) return null;
  if (k === items.length) return "Bunların hepsi KAPtan'ın öneri vermediği hisselerden; bilgi için burada.";
  if (k * 2 > items.length) return "Bunların çoğu KAPtan'ın öneri vermediği hisselerden; bilgi için burada.";
  return `${fmtInt(k)} tanesi KAPtan'ın öneri vermediği hisselerden; bilgi için burada.`;
}
