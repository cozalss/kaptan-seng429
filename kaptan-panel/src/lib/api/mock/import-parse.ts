import type { ImportKind, ImportMapping, NumberStyle, TypeChoice } from "@/lib/domain/imports";

/**
 * The test double's reading of a statement: the same rules as the backend (`imports/normalize.py`),
 * kept short. Day-first dates, numbers that are only read when clear, type words only from a short
 * known list or what the person chose. Never guesses.
 */
const KNOWN: Readonly<Record<string, ImportKind>> = {
  alis: "buy", alim: "buy", al: "buy", "hisse alis": "buy", buy: "buy",
  satis: "sell", sat: "sell", "hisse satis": "sell", sell: "sell",
  "para yatirma": "deposit", yatirma: "deposit", "para girisi": "deposit", deposit: "deposit",
  "para cekme": "withdrawal", cekme: "withdrawal", "para cikisi": "withdrawal", withdrawal: "withdrawal",
  temettu: "dividend", "kar payi": "dividend", "temettu odemesi": "dividend", dividend: "dividend",
};
const FOLD: Readonly<Record<string, string>> = { ı: "i", ş: "s", ğ: "g", ç: "c", ö: "o", ü: "u", â: "a", î: "i", û: "u" };
const TICKER = /^[A-Z0-9]{3,6}$/;

export function typeKey(raw: string): string {
  const folded = raw.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase().replace(/[ışğçöüâîû]/g, (c) => FOLD[c] ?? c);
  return folded.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).join(" ").slice(0, 60);
}

export function parseDate(text: string): string | null {
  const t = text.trim();
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T]+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(t);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(t);
  const [y, mo, d] = m ? [m[3], m[2], m[1]] : iso ? [iso[1], iso[2], iso[3]] : [null, null, null];
  if (!y || !mo || !d) return null;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (date.getUTCMonth() !== Number(mo) - 1 || date.getUTCDate() !== Number(d)) return null;
  return date.toISOString().slice(0, 10);
}

export function parseNumber(text: string, style: NumberStyle = "auto"): number | null {
  const raw = text.replace(/[₺$€]|\b(?:TL|TRY)\b/gi, "").replace(/[  ]/g, "");
  const negative = raw.startsWith("-") || (raw.startsWith("(") && raw.endsWith(")"));
  const s = raw.replace(/^[-+(]+|[)]+$/g, "");
  if (!/^[0-9.,]+$/.test(s) || !/\d/.test(s)) return null;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  let decimal = "";
  if (dots && commas) {
    decimal = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    if ((s.match(decimal === "." ? /\./g : /,/g) ?? []).length > 1) return null;
  } else if (commas) decimal = commas === 1 ? "," : "";
  else if (dots) {
    if (dots > 1) decimal = "";
    else if (style === "dot" || s.split(".")[1]?.length !== 3) decimal = ".";
    else return null;
  }
  const thousands = decimal === "." ? "," : ".";
  const clean = decimal ? s.split(thousands).join("").replace(decimal, ".") : s.replace(/[.,]/g, "");
  const n = Number(clean);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

export interface MockParsed {
  index: number;
  date: string | null;
  kind: ImportKind | null;
  ticker: string | null;
  qty: number | null;
  price: number | null;
  commission: number | null;
  amount: number | null;
  error: string;
  skipped: boolean;
  unknownType: string;
}

const blank = (index: number): MockParsed => ({ index, date: null, kind: null, ticker: null, qty: null, price: null, commission: null, amount: null, error: "", skipped: false, unknownType: "" });
const cell = (row: string[], col: number | null | undefined) => (col == null ? "" : (row[col] ?? "").trim());

function kindOf(row: string[], m: ImportMapping): { kind: ImportKind | null; error: string; unknown: string; skipped: boolean } {
  if (m.fixed_kind) return { kind: m.fixed_kind, error: "", unknown: "", skipped: false };
  const raw = cell(row, m.type);
  if (!raw) return { kind: null, error: "İşlem türü boş.", unknown: "", skipped: false };
  const key = typeKey(raw);
  const choice: TypeChoice | undefined = m.types[key] ?? KNOWN[key];
  if (!choice) return { kind: null, error: `“${raw.slice(0, 40)}” ne demek, bilmiyorum. Ne olduğunu sen seç.`, unknown: key, skipped: false };
  if (choice === "skip") return { kind: null, error: "Bu türü almayacağını söyledin.", unknown: "", skipped: true };
  return { kind: choice, error: "", unknown: "", skipped: false };
}

export function parseRow(index: number, row: string[], m: ImportMapping, style: NumberStyle): MockParsed {
  const out = blank(index);
  const k = kindOf(row, m);
  if (!k.kind) return { ...out, error: k.error, unknownType: k.unknown, skipped: k.skipped };
  const date = parseDate(cell(row, m.date));
  if (!date) return { ...out, kind: k.kind, error: "Tarihi okuyamadım. gg.aa.yyyy ya da yyyy-aa-gg bekliyorum." };
  const num = (col: number | null | undefined) => {
    const t = cell(row, col);
    return t ? parseNumber(t, style) : undefined;
  };
  const price = num(m.price);
  const commission = num(m.commission);
  const amount = num(m.amount);
  const base = { ...out, kind: k.kind, date, price: price ?? null, commission: commission == null ? null : Math.abs(commission), amount: amount == null ? null : Math.abs(amount) };
  if (price === null || commission === null || amount === null) return { ...base, error: "Bir sayıyı net okuyamadım." };
  if (k.kind === "deposit" || k.kind === "withdrawal") return base.amount ? { ...base, price: null, commission: null } : { ...base, error: "Tutar yok ya da okunamadı." };
  const ticker = cell(row, m.ticker).toUpperCase();
  if (!TICKER.test(ticker)) return { ...base, error: "Hisse kodu yok ya da tanıdık değil." };
  if (k.kind === "dividend") return base.amount ? { ...base, ticker, price: null, commission: null } : { ...base, ticker, error: "Kâr payı tutarı yok ya da okunamadı." };
  const q = num(m.qty);
  if (q == null || !Number.isInteger(q) || q === 0) return { ...base, ticker, error: "Adet yok, okunamadı ya da tam sayı değil." };
  const qty = Math.abs(q);
  const unit = base.price ?? (base.amount ? Math.round((base.amount / qty) * 1e4) / 1e4 : null);
  if (!unit || unit <= 0) return { ...base, ticker, qty, error: "Fiyat yok ya da okunamadı." };
  return { ...base, ticker, qty, price: unit };
}

export function parseRows(table: string[][], m: ImportMapping, style: NumberStyle): MockParsed[] {
  const start = m.has_header ? 1 : 0;
  return table.slice(start).map((row, i) => parseRow(i + start, row, m, style));
}

/** A row's identity: what it says and its place among identical rows (a stand-in for the backend's SHA-256). */
export function rowKeys(rows: MockParsed[]): Map<number, string> {
  const seen = new Map<string, number>();
  const out = new Map<number, string>();
  for (const r of rows) {
    if (r.error || !r.kind) continue;
    const body = [r.date, r.kind, r.ticker, r.qty, r.price, r.commission, r.amount].join("|");
    const n = seen.get(body) ?? 0;
    seen.set(body, n + 1);
    out.set(r.index, `${body}|${n}`);
  }
  return out;
}
