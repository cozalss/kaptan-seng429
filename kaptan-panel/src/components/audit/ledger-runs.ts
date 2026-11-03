import type { AuditEntry } from "@/lib/domain";
import { fmtInt, fmtTime } from "@/lib/format";

/**
 * The diary reads better when routine machine work is folded together: nine "bildirimini
 * okudu" rows in a row become one line, "KAPtan 9 duyuru okudu", and nineteen
 * rule vetoes become "Kurallar 19 şirket için öneriyi baştan reddetti", each opening to show
 * the originals. Only consecutive records by the same machine doing the same thing fold; a
 * person's act is never folded away. Pure: returns a new array, the entries are not touched.
 */
export type LedgerRow =
  | { kind: "one"; entry: AuditEntry }
  | { kind: "run"; actor: string; action: string; entries: readonly AuditEntry[] };

/** KAPtan's routine folds; what you did never does. */
const foldable = (e: AuditEntry) => !e.actor.startsWith("user:") && e.actor !== "auth";

const sameKind = (a: AuditEntry, b: AuditEntry) => a.actor === b.actor && a.action === b.action;

export function groupRuns(entries: readonly AuditEntry[]): LedgerRow[] {
  const rows: LedgerRow[] = [];
  let run: AuditEntry[] = [];
  const flush = () => {
    const head = run[0];
    if (run.length === 1 && head) rows.push({ kind: "one", entry: head });
    else if (run.length > 1 && head) rows.push({ kind: "run", actor: head.actor, action: head.action, entries: run });
    run = [];
  };
  for (const e of entries) {
    const head = run[0];
    if (!head || !sameKind(head, e) || !foldable(e)) flush();
    if (foldable(e)) run = [...run, e];
    else rows.push({ kind: "one", entry: e });
  }
  flush();
  return rows;
}

/** What a folded run says, in one sentence: "KAPtan 9 duyuru okudu." */
export function runSentence(actorName: string, action: string, count: number): string {
  const n = fmtInt(count);
  switch (action) {
    case "disclosure.ingested":
      return `KAPtan ${n} duyuru okudu.`;
    case "risk.rejected":
      return `KAPtan ${n} şirket için öneriyi baştan eledi.`;
    case "pregate.decided":
      return `KAPtan ${n} bildirimi eledi.`;
    case "classification.done":
      return `KAPtan ${n} bildirimin türünü belirledi.`;
    case "risk.checked":
      return `KAPtan ${n} öneriyi sınırlarla karşılaştırdı.`;
    default:
      return `${actorName}: ${n} benzer kayıt.`;
  }
}

/** "06:22–08:38": the span a folded run covers, oldest first. */
export function runMeta(entries: readonly AuditEntry[], time: (iso: string) => string = fmtTime): string {
  const byPos = [...entries].sort((a, b) => a.chain_pos - b.chain_pos);
  const first = byPos[0];
  const last = byPos[byPos.length - 1];
  if (!first || !last) return "";
  return `${time(first.occurred_at)}–${time(last.occurred_at)}`;
}
