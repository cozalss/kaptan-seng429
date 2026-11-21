import { z } from "zod";
import { IsoDate } from "./common";

/**
 * Importing a broker or MKK statement (backend `imports/`, wave 5):
 *  - POST /me/import/read?source=&filename=   raw bytes          → ImportTable   (parsed in memory, nothing stored)
 *  - POST /me/import/preview                  ImportRequest      → ImportPreview (new / recorded / conflict; writes nothing)
 *  - POST /me/import/apply                    ImportApplyRequest → ImportResult  (writes only the ticked new rows)
 *  - GET  /me/import/sources                  → ImportSources
 * The panel keeps the parsed table and sends it back with the confirmed mapping each time; the server re-reads it.
 */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 3000;
export const IMPORT_MAX_COLUMNS = 30;
export const IMPORT_MAX_CELL = 100;
export const IMPORT_MAX_SOURCE = 40;

export const ImportKind = z.enum(["buy", "sell", "deposit", "withdrawal", "dividend"]);
export type ImportKind = z.infer<typeof ImportKind>;
export const TypeChoice = z.enum(["buy", "sell", "deposit", "withdrawal", "dividend", "skip"]);
export type TypeChoice = z.infer<typeof TypeChoice>;
export const ImportFileKind = z.enum(["csv", "xlsx", "pdf"]);
export const NumberStyle = z.enum(["auto", "dot"]);
export type NumberStyle = z.infer<typeof NumberStyle>;
export const ImportRowStatus = z.enum(["new", "recorded", "conflict", "invalid", "skipped"]);
export type ImportRowStatus = z.infer<typeof ImportRowStatus>;

/** Starts with a letter or digit; letters, digits, space, dot and dash only (it ends up in a note). */
export const ImportSourceName = z
  .string()
  .trim()
  .min(1)
  .max(IMPORT_MAX_SOURCE)
  .regex(/^[0-9A-Za-zÇĞİÖŞÜçğıöşü][0-9A-Za-zÇĞİÖŞÜçğıöşü .-]*$/, "Adı harf ve rakamla yaz.");

const Column = z.number().int().min(0).lt(IMPORT_MAX_COLUMNS);

/** Which column holds what. `types` maps a type word of the file (folded: "alis") to what it means. */
export const ImportMapping = z.object({
  has_header: z.boolean(),
  date: Column.nullish(),
  type: Column.nullish(),
  fixed_kind: ImportKind.nullish(),
  ticker: Column.nullish(),
  qty: Column.nullish(),
  price: Column.nullish(),
  commission: Column.nullish(),
  amount: Column.nullish(),
  types: z.record(z.string().max(60), TypeChoice).default({}),
});
export type ImportMapping = z.infer<typeof ImportMapping>;

export const ImportTable = z.object({
  file_kind: ImportFileKind,
  number_style: NumberStyle,
  columns: z.number().int(),
  rows: z.array(z.array(z.string())),
  truncated: z.boolean(),
  has_header_guess: z.boolean(),
  saved_mapping: ImportMapping.nullable(),
  saved_matches: z.boolean(),
});
export type ImportTable = z.infer<typeof ImportTable>;

export const ImportRequest = z.object({
  source: ImportSourceName,
  mapping: ImportMapping,
  number_style: NumberStyle.default("auto"),
  rows: z.array(z.array(z.string().max(IMPORT_MAX_CELL)).max(IMPORT_MAX_COLUMNS)).max(IMPORT_MAX_ROWS + 1),
});
export type ImportRequest = z.input<typeof ImportRequest>;

export const ImportApplyRequest = ImportRequest.extend({ selected: z.array(z.number().int()).max(IMPORT_MAX_ROWS + 1) });
export type ImportApplyRequest = z.input<typeof ImportApplyRequest>;

export const ImportRow = z.object({
  index: z.number().int(),
  date: IsoDate.nullable(),
  kind: ImportKind.nullable(),
  ticker: z.string().nullable(),
  qty: z.number().int().nullable(),
  price: z.number().nullable(),
  commission_try: z.number().nullable(),
  amount_try: z.number().nullable(),
  status: ImportRowStatus,
  reason: z.string(),
});
export type ImportRow = z.infer<typeof ImportRow>;

export const ImportPreview = z.object({
  rows: z.array(ImportRow),
  new: z.number().int(),
  recorded: z.number().int(),
  conflict: z.number().int(),
  invalid: z.number().int(),
  skipped: z.number().int(),
  unknown_types: z.array(z.string()),
  started: z.boolean(),
});
export type ImportPreview = z.infer<typeof ImportPreview>;

export const ImportResult = z.object({ written: z.number().int(), failed: z.array(ImportRow), preview: ImportPreview });
export type ImportResult = z.infer<typeof ImportResult>;

export const ImportSources = z.object({ sources: z.array(z.string()) });
export type ImportSources = z.infer<typeof ImportSources>;
