import type { AuditEntry } from "@/lib/domain";
import { fmtInt, fmtTime } from "@/lib/format";

/**
 * The ledger reads better when routine machine work is folded together: nine "bildirimi
 * getirdi" rows in a row become one line, "KAP okuyucu 9 bildirim getirdi", and nineteen
 * rule vetoes become "Kurallar 19 şirket için öneriyi baştan reddetti", each opening to show
 * the originals. Only consecutive records by the same machine doing the same thing fold; a
 * person's act is never folded away. Pure: returns a new array, the entries are not touched.
 */
export type LedgerRow =
  | { kind: "one"; entry: AuditEntry }
  | { kind: "run"; actor: string; action: string; entries: readonly AuditEntry[] };

/** Machines and crew fold; people (user:… and team members) never do. */
const foldable = (e: AuditEntry) => !e.actor.startsWith("user:") && !/^uye-/.test(e.actor) && e.actor !== "auth";

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

/** What a folded run says, in one sentence: "KAP okuyucu 9 bildirim getirdi." */
export function runSentence(actorName: string, action: string, count: number): string {
  const n = fmtInt(count);
  switch (action) {
    case "disclosure.ingested":
      return `${actorName} ${n} bildirim getirdi.`;
    case "risk.rejected":
      return `Kurallar ${n} şirket için öneriyi baştan reddetti.`;
    case "pregate.decided":
      return `Ön eleme ${n} bildirimi süzdü.`;
    case "classification.done":
      return `Sınıflandırıcı ${n} bildirimin türünü belirledi.`;
    case "risk.checked":
      return `Risk kapısı ${n} öneriyi denetledi.`;
    default:
      return `${actorName}: ${n} benzer kayıt.`;
  }
}

/** "06:22–08:38 · #4.785–#4.802": the span a folded run covers, oldest first. */
export function runMeta(entries: readonly AuditEntry[], time: (iso: string) => string = fmtTime): string {
  const byPos = [...entries].sort((a, b) => a.chain_pos - b.chain_pos);
  const first = byPos[0];
  const last = byPos[byPos.length - 1];
  if (!first || !last) return "";
  return `${time(first.occurred_at)}–${time(last.occurred_at)} · #${fmtInt(first.chain_pos)}–#${fmtInt(last.chain_pos)}`;
}
