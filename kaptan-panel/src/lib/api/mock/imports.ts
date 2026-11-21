import { ImportApplyRequest, ImportRequest, IMPORT_MAX_BYTES, IMPORT_MAX_CELL, IMPORT_MAX_COLUMNS, IMPORT_MAX_ROWS, type ImportMapping, type ImportPreview, type ImportRow, type ImportRowStatus, type ImportTable } from "@/lib/domain/imports";
import { ApiError, type KaptanApi } from "../types";
import { parse, userActor, type MockCtx } from "./guard";
import { hasStarted, ownHeld, SEED_STARTED_AT, type OwnHolding, type StoredMovement } from "./ledger";
import { createCorporate } from "./corporate";
import { parseRows, rowKeys, typeKey, type MockParsed } from "./import-parse";
import type { MockState } from "./state";
import * as sel from "./selectors";

/**
 * Statement import in the test double: same answers and error codes as the backend (`imports/`).
 * It only opens CSV (the backend also reads XLSX and text PDFs) and keeps the "already imported"
 * keys and the remembered mapping in the book. Nothing of the file is kept.
 */
type Imports = Pick<KaptanApi, "importRead" | "importPreview" | "importApply" | "importSources">;

const MSG_NOT_STARTED = "Önce başlangıç paranı gir; sonra dökümü yükleyebilirsin.";
const MSG_BEFORE_START = "Bu, KAPtan'a başladığın günden önce. O günlerden önceki hisselerini “Elimdeki hisse” olarak elle ekle.";
const MSG_OVER_CASH = "Kasanda bunun için yeterli nakit görünmüyor. Önce para eklediğini kaydet.";
const MSG_NOT_HELD = "Elinde bu kadar yok. Önce aldığını kaydet ya da elindeki hisseyi elle ekle.";
const MSG_USE_TICKET = "Bu hisse KAPtan'ın önerisinden. Satışı işlem fişinden kaydet.";
const MSG_NEVER_HELD = "Bu hisse defterinde hiç yok.";
const ORDER: Readonly<Record<string, number>> = { deposit: 0, buy: 1, dividend: 2, sell: 3, withdrawal: 4 };
const COMMISSION_RATE = 0.002;

const cents = (n: number) => Math.round(n * 100) / 100;
const istDay = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);
const noonOf = (day: string, now: string) => (Date.parse(`${day}T09:00:00.000Z`) > Date.parse(now) ? now : `${day}T09:00:00.000Z`);

/** Rows of a CSV text: delimiter by counting, quotes honoured, nothing evaluated. */
export function csvRows(text: string): string[][] {
  const head = text.split(/\r?\n/).slice(0, 20).join("\n");
  const delim = [";", ",", "\t", "|"].reduce((best, d) => (head.split(d).length > head.split(best).length ? d : best), ";");
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? "";
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else cur += c;
  }
  row.push(cur);
  rows.push(row);
  return rows.map((r) => r.slice(0, IMPORT_MAX_COLUMNS).map((c) => c.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, IMPORT_MAX_CELL))).filter((r) => r.some(Boolean));
}

/** The file's text (older test environments lack Blob.text). */
function textOf(file: Blob): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function headerKey(table: string[][]): string {
  return (table[0] ?? []).map(typeKey).join("|");
}

function startDay(state: MockState): string {
  const start = state.book.seeded ? SEED_STARTED_AT : state.book.movements.find((m) => m.kind === "start")?.occurred_at;
  return istDay(start ?? SEED_STARTED_AT);
}

interface Judged { row: MockParsed; status: ImportRowStatus; reason: string; commission: number | null }

function judge(state: MockState, rows: MockParsed[], now: string): Judged[] {
  const keys = rowKeys(rows);
  const known = new Set(state.book.imported ?? []);
  const out = new Map<number, Judged>();
  const fresh: MockParsed[] = [];
  for (const r of rows) {
    if (r.skipped) out.set(r.index, { row: r, status: "skipped", reason: r.error, commission: null });
    else if (r.error) out.set(r.index, { row: r, status: "invalid", reason: r.error, commission: null });
    else if (known.has(keys.get(r.index) ?? "")) out.set(r.index, { row: r, status: "recorded", reason: "Bu satırı daha önce aktardın.", commission: null });
    else fresh.push(r);
  }
  const started = hasStarted(state.book);
  const start = startDay(state);
  const book = sel.bookOf(state);
  let cash = book.cash;
  const held = new Map<string, number>();
  const other = new Map<string, number>();
  for (const p of sel.positions(state)) {
    const side = p.origin === "own" ? held : other;
    side.set(p.ticker, (side.get(p.ticker) ?? 0) + p.qty);
  }
  const ever = new Set([...held.keys(), ...other.keys(), ...state.book.holdings.map((h) => h.ticker)]);
  const order = [...fresh].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || ORDER[a.kind ?? "deposit"]! - ORDER[b.kind ?? "deposit"]! || a.index - b.index);
  for (const r of order) {
    const bad = (reason: string, commission: number | null = null) => out.set(r.index, { row: r, status: "conflict", reason, commission });
    if (!started) { bad(MSG_NOT_STARTED); continue; }
    if (r.date && r.date > istDay(now)) { bad("Bu tarih bugünden sonra."); continue; }
    if (r.date && r.date < start) { bad(MSG_BEFORE_START); continue; }
    if (r.ticker && !sel.companyOf(r.ticker)) { bad("Bu hisse kodunu tanımıyorum."); continue; }
    const ok = (commission: number | null = null) => out.set(r.index, { row: r, status: "new", reason: "", commission });
    if (r.kind === "buy" || r.kind === "sell") {
      const gross = (r.price ?? 0) * (r.qty ?? 0);
      const commission = r.commission ?? cents(gross * COMMISSION_RATE);
      if (r.kind === "buy") {
        if (gross + commission > cash) { bad(MSG_OVER_CASH, commission); continue; }
        cash -= gross + commission;
        held.set(r.ticker!, (held.get(r.ticker!) ?? 0) + (r.qty ?? 0));
        ever.add(r.ticker!);
      } else {
        if ((held.get(r.ticker!) ?? 0) < (r.qty ?? 0)) { bad((other.get(r.ticker!) ?? 0) > 0 ? MSG_USE_TICKET : MSG_NOT_HELD, commission); continue; }
        held.set(r.ticker!, (held.get(r.ticker!) ?? 0) - (r.qty ?? 0));
        cash += gross - commission;
      }
      ok(commission);
    } else if (r.kind === "withdrawal") {
      if ((r.amount ?? 0) > cash) bad(MSG_OVER_CASH); else { cash -= r.amount ?? 0; ok(); }
    } else if (r.kind === "deposit") { cash += r.amount ?? 0; ok(); }
    else if (!ever.has(r.ticker ?? "")) bad(MSG_NEVER_HELD);
    else { cash += r.amount ?? 0; ok(); }
  }
  return rows.map((r) => out.get(r.index)!);
}

const view = (j: Judged): ImportRow => ({
  index: j.row.index, date: j.row.date, kind: j.row.kind, ticker: j.row.ticker, qty: j.row.qty, price: j.row.price,
  commission_try: j.commission ?? j.row.commission, amount_try: j.row.amount, status: j.status, reason: j.reason,
});

function preview(state: MockState, judged: Judged[], rows: MockParsed[]): ImportPreview {
  const n = (s: ImportRowStatus) => judged.filter((j) => j.status === s).length;
  return { rows: judged.map(view), new: n("new"), recorded: n("recorded"), conflict: n("conflict"), invalid: n("invalid"), skipped: n("skipped"), unknown_types: [...new Set(rows.map((r) => r.unknownType).filter(Boolean))].sort(), started: hasStarted(state.book) };
}

export function createImports(ctx: MockCtx): Imports {
  const { db, ok, now } = ctx;
  const corporate = createCorporate(ctx);
  const read = (m: ImportMapping, table: string[][], style: "auto" | "dot") => parseRows(table, m, style);

  async function write(j: Judged, source: string, key: string): Promise<void> {
    const a = ctx.me();
    const r = j.row;
    const at = noonOf(r.date ?? istDay(now()), now());
    const note = `Dökümden aktarıldı: ${source}`;
    const book = db.snapshot.book;
    if (r.kind === "deposit" || r.kind === "withdrawal") {
      const m: StoredMovement = { id: `mv-${book.movements.length + 1}`, kind: r.kind, amount_try: r.amount ?? 0, occurred_at: at, note };
      db.update((s) => ({ ...s, book: { ...s.book, movements: [...s.book.movements, m] } }));
      db.audit(userActor(a), r.kind === "deposit" ? "money.deposited" : "money.withdrawn", "book", m.id, { amount_try: m.amount_try, imported: true });
    } else if (r.kind === "dividend") {
      await corporate.recordDividend({ ticker: r.ticker!, net_try: r.amount ?? 0, received_on: r.date!, note });
    } else if (r.kind === "buy") {
      const commission = j.commission ?? 0;
      const company = sel.companyOf(r.ticker!)!;
      const h: OwnHolding = { id: `own-${book.holdings.length + 1}`, ticker: r.ticker!, company_name: company.name, qty: r.qty!, avg_cost: r.price!, bought_on: r.date!, added_at: at, price_at_add: r.price!, sales: [], paid_cash: cents(r.price! * r.qty! + commission) };
      db.update((s) => ({ ...s, book: { ...s.book, holdings: [...s.book.holdings, h] } }));
      db.audit(userActor(a), "holding.bought", "position", h.id, { ticker: h.ticker, company: h.company_name, qty: h.qty, price: h.avg_cost, commission_try: commission, imported: true });
    } else {
      let left = r.qty!;
      for (const h of db.snapshot.book.holdings.filter((x) => x.ticker === r.ticker)) {
        const take = Math.min(left, ownHeld(db.snapshot.book, h.id));
        if (take <= 0) continue;
        const sale = { qty: take, price: r.price!, commission: left === r.qty ? (j.commission ?? 0) : 0, at };
        db.update((s) => ({ ...s, book: { ...s.book, holdings: s.book.holdings.map((x) => (x.id === h.id ? { ...x, sales: [...x.sales, sale] } : x)) } }));
        db.audit(userActor(a), "holding.sold", "position", h.id, { ticker: h.ticker, company: h.company_name, qty: take, price: r.price, imported: true });
        left -= take;
      }
    }
    db.update((s) => ({ ...s, book: { ...s.book, imported: [...(s.book.imported ?? []), key] } }));
  }

  return {
    async importRead(file, filename, source) {
      ctx.me();
      if (!/^[0-9A-Za-zÇĞİÖŞÜçğıöşü][0-9A-Za-zÇĞİÖŞÜçğıöşü .-]*$/.test(source) || source.length > 40) throw new ApiError(422, "validation", "Kaynak adını harf ve rakamla yaz.");
      if (file.size > IMPORT_MAX_BYTES) throw new ApiError(413, "too_large", "Dosya 5 MB'tan büyük. Daha küçük bir dönem seç.");
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      if (!["csv", "tsv", "txt"].includes(ext)) throw new ApiError(415, "unsupported_type", "Bu dosya türünü okuyamıyorum. CSV, XLSX ya da yazısı seçilebilen bir PDF yükle.");
      const rows = csvRows(await textOf(file));
      if (!rows.length) throw new ApiError(422, "empty", "Dosyada okunacak satır bulamadım.");
      const truncated = rows.length > IMPORT_MAX_ROWS + 1;
      const kept = rows.slice(0, IMPORT_MAX_ROWS + 1);
      const saved = db.snapshot.book.importMappings?.[source] ?? null;
      const first = (kept[0] ?? []).join(" ").toLowerCase();
      const table: ImportTable = {
        file_kind: "csv", number_style: "auto", columns: Math.max(...kept.map((r) => r.length)), rows: kept, truncated,
        has_header_guess: ["tarih", "date", "islem", "işlem", "hisse", "adet", "fiyat", "tutar"].some((w) => first.includes(w)),
        saved_mapping: saved?.mapping ?? null, saved_matches: saved !== null && saved.header_key === headerKey(kept),
      };
      return ok(table, 200);
    },

    async importPreview(input) {
      ctx.me();
      const body = parse(ImportRequest, input);
      const rows = read(body.mapping, body.rows, body.number_style);
      return ok(preview(db.snapshot, judge(db.snapshot, rows, now()), rows), 120);
    },

    async importApply(input) {
      const a = ctx.me();
      const body = parse(ImportApplyRequest, input);
      const rows = read(body.mapping, body.rows, body.number_style);
      const keys = rowKeys(rows);
      const chosen = new Set(body.selected);
      const todo = judge(db.snapshot, rows, now()).filter((j) => j.status === "new" && chosen.has(j.row.index));
      todo.sort((x, y) => (x.row.date ?? "").localeCompare(y.row.date ?? "") || ORDER[x.row.kind ?? "deposit"]! - ORDER[y.row.kind ?? "deposit"]! || x.row.index - y.row.index);
      let written = 0;
      const failed: ImportRow[] = [];
      for (const j of todo) {
        try {
          await write(j, body.source, keys.get(j.row.index) ?? "");
          written += 1;
        } catch (err) {
          failed.push(view({ ...j, status: "conflict", reason: err instanceof ApiError ? err.message : "Yazılamadı." }));
        }
      }
      const header = headerKey(body.rows);
      db.update((s) => ({ ...s, book: { ...s.book, importMappings: { ...s.book.importMappings, [body.source]: { mapping: body.mapping, header_key: header } } } }));
      if (written > 0) db.audit(userActor(a), "import.applied", "book", "dokum", { source: body.source, written });
      return ok({ written, failed, preview: preview(db.snapshot, judge(db.snapshot, rows, now()), rows) }, 260);
    },

    async importSources() {
      ctx.me();
      return ok({ sources: Object.keys(db.snapshot.book.importMappings ?? {}) }, 60);
    },
  };
}
