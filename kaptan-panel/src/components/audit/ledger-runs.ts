import type { AuditEntry } from "@/lib/domain";
import { fmtInt, fmtTime } from "@/lib/format";

/**
 * The ledger reads better when the KAP okuyucu's routine fetches are folded together:
 * nine "bildirimi getirdi" rows in a row become one line, "KAP okuyucu 9 bildirim getirdi",
 * that opens to show the nine. Only consecutive fetches by the same machine fold; a person's
 * act is never folded away. Pure: returns a new array, the entries are not touched.
 */
export type LedgerRow =
  | { kind: "one"; entry: AuditEntry }
  | { kind: "run"; actor: string; entries: readonly AuditEntry[] };

const FOLDS: Readonly<Record<string, string>> = { "system:kap_poller": "disclosure.ingested" };

const foldable = (e: AuditEntry) => FOLDS[e.actor] === e.action;

export function groupRuns(entries: readonly AuditEntry[]): LedgerRow[] {
  const rows: LedgerRow[] = [];
  let run: AuditEntry[] = [];
  const flush = () => {
    if (run.length === 1) rows.push({ kind: "one", entry: run[0] as AuditEntry });
    else if (run.length > 1) rows.push({ kind: "run", actor: (run[0] as AuditEntry).actor, entries: run });
    run = [];
  };
  for (const e of entries) {
    const joins = foldable(e) && (run.length === 0 || (run[0] as AuditEntry).actor === e.actor);
    if (!joins) flush();
    if (foldable(e)) run = [...run, e];
    else rows.push({ kind: "one", entry: e });
  }
  flush();
  return rows;
}

/** "06:22–08:38 · #4.785–#4.802": the span a folded run covers, oldest first. */
export function runMeta(entries: readonly AuditEntry[], time: (iso: string) => string = fmtTime): string {
  const byPos = [...entries].sort((a, b) => a.chain_pos - b.chain_pos);
  const first = byPos[0];
  const last = byPos[byPos.length - 1];
  if (!first || !last) return "";
  return `${time(first.occurred_at)}–${time(last.occurred_at)} · #${fmtInt(first.chain_pos)}–#${fmtInt(last.chain_pos)}`;
}
