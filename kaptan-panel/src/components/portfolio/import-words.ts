import type { ImportKind, ImportMapping, ImportRow, TypeChoice } from "@/lib/domain/imports";
import { IMPORT_MAX_BYTES } from "@/lib/domain/imports";
import { fmtInt } from "@/lib/format";
import { fmtLira } from "@/lib/solo/words";

/** Plain words for the statement import: what a row is, what a column holds, what a file may be. */
export const FIELDS: ReadonlyArray<{ key: "date" | "type" | "ticker" | "qty" | "price" | "commission" | "amount"; label: string; hint: string; words: string[] }> = [
  { key: "date", label: "Tarih", hint: "İşlemin günü", words: ["tarih", "date", "gün"] },
  { key: "type", label: "İşlem türü", hint: "Alış, satış, para yatırma…", words: ["işlem", "islem", "tür", "tur", "type", "yön"] },
  { key: "ticker", label: "Hisse kodu", hint: "Örneğin KRGCL", words: ["hisse", "kod", "sembol", "symbol", "ticker", "menkul"] },
  { key: "qty", label: "Adet", hint: "Kaç hisse", words: ["adet", "miktar", "qty", "lot"] },
  { key: "price", label: "Fiyat", hint: "Tanesi kaç lira", words: ["fiyat", "price", "kur"] },
  { key: "commission", label: "Komisyon", hint: "Bankanın aldığı (boşsa tahmin ederim)", words: ["komisyon", "masraf", "ücret", "ucret", "commission"] },
  { key: "amount", label: "Tutar", hint: "Toplam lira (para hareketi ve kâr payı için)", words: ["tutar", "toplam", "amount", "bedel"] },
];

export const KIND_LABEL: Readonly<Record<ImportKind, string>> = {
  buy: "Aldın",
  sell: "Sattın",
  deposit: "Para ekledin",
  withdrawal: "Para çektin",
  dividend: "Kâr payı aldın",
};

export const CHOICES: ReadonlyArray<{ value: TypeChoice; label: string }> = [
  { value: "buy", label: "Hisse alışı" },
  { value: "sell", label: "Hisse satışı" },
  { value: "deposit", label: "Para yatırma" },
  { value: "withdrawal", label: "Para çekme" },
  { value: "dividend", label: "Kâr payı" },
  { value: "skip", label: "Bu satırları alma" },
];

export const ALLOWED_EXTENSIONS = ["csv", "tsv", "txt", "xlsx", "pdf"] as const;

/** A first check in the browser (the server checks again, from the file's own bytes). */
export function fileProblem(file: { name: string; size: number }): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.size > IMPORT_MAX_BYTES) return "Dosya 5 MB'tan büyük. Daha küçük bir dönem seç.";
  if (file.size === 0) return "Dosya boş.";
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) return "CSV, XLSX ya da yazısı seçilebilen bir PDF seç.";
  return null;
}

/** Columns whose header names the field: only a suggestion the person confirms. */
export function suggestMapping(header: readonly string[], hasHeader: boolean): ImportMapping {
  const find = (words: string[]) => {
    const at = header.findIndex((h) => words.some((w) => h.toLocaleLowerCase("tr-TR").includes(w)));
    return at >= 0 ? at : null;
  };
  const pick = (key: (typeof FIELDS)[number]["key"]) => (hasHeader ? find(FIELDS.find((f) => f.key === key)?.words ?? []) : null);
  return { has_header: hasHeader, date: pick("date"), type: pick("type"), ticker: pick("ticker"), qty: pick("qty"), price: pick("price"), commission: pick("commission"), amount: pick("amount"), fixed_kind: null, types: {} };
}

/** The mapping can be previewed: a date, and either a type column or one type for all rows. */
export function mappingProblem(m: ImportMapping): string | null {
  if (m.date == null) return "Tarih hangi sütunda, seç.";
  if (m.type == null && !m.fixed_kind) return "İşlem türü hangi sütunda? Hepsi aynı türse onu seç.";
  return null;
}

export function rowSentence(r: ImportRow): string {
  const day = r.date ? r.date.split("-").reverse().join(".") : "Tarih yok";
  const who = r.ticker ?? "";
  if (r.kind === "buy" || r.kind === "sell") return `${day}: ${who} ${fmtInt(r.qty ?? 0)} adet ${r.kind === "buy" ? "aldın" : "sattın"}, tanesi ${fmtLira(r.price ?? 0, true)}.`;
  if (r.kind === "dividend") return `${day}: ${who} kâr payı ${fmtLira(r.amount_try ?? 0, true)}.`;
  if (r.kind) return `${day}: ${KIND_LABEL[r.kind]} ${fmtLira(r.amount_try ?? 0, true)}.`;
  return `${day}: okunamadı.`;
}
