import type { Digest, DigestItem, DigestKind } from "@/lib/domain/digest";

/** The small words the digest screens use. Pure, so they can be tested. */
export const KIND_TITLE: Readonly<Record<DigestKind, string>> = {
  restriction: "SPK tedbiri",
  insider: "Yönetici ve ana ortak işlemleri",
  contract: "Yeni iş ve ihale",
  earnings: "Finansal sonuçlar",
  dividend: "Kâr payı",
  capital: "Sermaye artırımı ve azaltımı",
  merger: "Birleşme ve bölünme",
  buyback: "Kendi hissesini geri alanlar",
};

export interface KindGroup {
  kind: DigestKind;
  title: string;
  items: DigestItem[];
}

/** The items of companies you hold or watch, in the order the server sent them (held first). */
export function mineOf(items: ReadonlyArray<DigestItem>): DigestItem[] {
  return items.filter((i) => i.why !== null);
}

/** The rest, grouped by kind in the order the kinds first appear (the server already ordered them). */
export function groupByKind(items: ReadonlyArray<DigestItem>): KindGroup[] {
  const groups = new Map<DigestKind, DigestItem[]>();
  for (const i of items) groups.set(i.kind, [...(groups.get(i.kind) ?? []), i]);
  return [...groups.entries()].map(([kind, list]) => ({ kind, title: KIND_TITLE[kind], items: list }));
}

/** The one big sentence of the screen. */
export function digestSentence(d: Digest | null, today: string | null): string {
  if (d === null) return "Duyuruları hazırlıyorum…";
  const isToday = today !== null && d.day === today;
  if (d.total === 0) return isToday ? "Bugün dikkat çeken duyuru yok." : "Bu gün dikkat çeken duyuru yok.";
  const n = d.total;
  return isToday ? `Bugün ${n} önemli duyuru var.` : `Bu gün ${n} önemli duyuru vardı.`;
}
