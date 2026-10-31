"use client";

import { memo, useMemo } from "react";
import type { AuditEntry } from "@/lib/domain";
import { memberByUid } from "@/lib/domain/user";
import { actorParts } from "@/lib/actors";
import { auditCompany, auditSentence } from "@/lib/audit-words";
import { fmtInt, fmtShortDate, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RoleEmblem } from "@/components/roles/role-emblem";
import { TH } from "@/components/portfolio/kit";
import { groupRuns, runMeta, runSentence } from "./ledger-runs";

export type Scope = "today" | "all";

/** The id a record's row carries, so "Defterde göster →" can scroll to it. */
export const rowId = (pos: number) => `kayit-${pos}`;

/**
 * The ledger as a plain table: time, who, what happened (one sentence) and the record's number
 * in the chain. People's acts carry their role's mark; the broken record is tinted north red;
 * the KAP okuyucu's routine fetches fold into one line that opens to the originals.
 */
export const Timeline = memo(function Timeline({ items, scope, broken }: { items: readonly AuditEntry[]; scope: Scope; broken: number | null }) {
  const rows = useMemo(() => groupRuns(items), [items]);
  return (
    <div>
      <div aria-hidden className={cn(GRID, "sticky top-14 z-10 hidden bg-panel/95 lg:top-0 py-2.5 shadow-[inset_0_-2px_0_var(--hairline)] backdrop-blur-sm sm:grid", TH)}>
        <span>{scope === "today" ? "Saat" : "Tarih"}</span>
        <span>Kim</span>
        <span>Ne oldu</span>
        <span className="text-right">Kayıt</span>
      </div>
      <ol aria-label="Denetim kayıtları" className="divide-y divide-hairline">
        {rows.map((r) =>
          r.kind === "one" ? (
            <Row key={r.entry.chain_pos} entry={r.entry} scope={scope} broken={broken} />
          ) : (
            <Run key={`run-${r.entries[0]?.chain_pos}`} entries={r.entries} actor={r.actor} action={r.action} scope={scope} broken={broken} />
          ),
        )}
      </ol>
    </div>
  );
});

/** Desktop: four columns. Phone: time | what (who under it) | record. */
const GRID =
  "grid grid-cols-[48px_minmax(0,1fr)_auto] gap-x-3 px-4 sm:grid-cols-[64px_150px_minmax(0,1fr)_72px] sm:gap-x-4 sm:px-6";

function When({ iso, scope }: { iso: string; scope: Scope }) {
  return (
    <time dateTime={iso} className="text-ui text-ink tabular-nums">
      {scope === "today" ? fmtTime(iso) : fmtShortDate(iso)}
    </time>
  );
}

/** The sentence; a ticker nobody could name stays a code. */
function Sentence({ entry }: { entry: AuditEntry }) {
  const text = auditSentence(entry);
  const company = auditCompany(entry);
  const at = company.code ? text.indexOf(company.text) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <code className="code">{company.text}</code>
      {text.slice(at + company.text.length)}
    </>
  );
}

function Who({ actor, className }: { actor: string; className?: string }) {
  const who = actorParts(actor);
  const person = memberByUid(actor);
  return (
    <span className={cn("min-w-0 text-dense", className)} title={who.kind ? `${who.name} · ${who.kind}` : who.name}>
      <span className={cn("flex min-w-0 items-center gap-2", person ? "font-semibold text-ink" : "text-ink-soft")}>
        {person ? (
          <span aria-hidden className={cn(`tone-${person.role}`, "grid size-6 shrink-0 place-items-center rounded-full bg-[var(--tone)] text-on-dark")}>
            <RoleEmblem role={person.role} className="size-3.5" />
          </span>
        ) : (
          <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-sunk text-[11px] font-semibold text-muted">
            {who.name.charAt(0)}
          </span>
        )}
        <span className="truncate">{who.name}</span>
        {who.kind ? <span className="sr-only"> · {who.kind}</span> : null}
      </span>
    </span>
  );
}

function Pos({ entry, bad }: { entry: AuditEntry; bad: boolean }) {
  return (
    <span className={cn("text-right text-dense tabular-nums", bad ? "font-semibold text-north" : "text-ink-soft")} title={`parmak izi (hash): ${entry.hash}`}>
      #{fmtInt(entry.chain_pos)}
    </span>
  );
}

function Row({ entry, scope, broken }: { entry: AuditEntry; scope: Scope; broken: number | null }) {
  const person = memberByUid(entry.actor);
  const bad = broken !== null && entry.chain_pos === broken;
  return (
    <li
      id={rowId(entry.chain_pos)}
      className={cn(
        GRID,
        "scroll-mt-24 items-center py-2.5 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
        person && !bad && `tone-${person.role} shadow-[inset_3px_0_0_var(--tone)]`,
        bad && "bg-north-tint shadow-[inset_4px_0_0_var(--north)]",
      )}
    >
      <When iso={entry.occurred_at} scope={scope} />
      <Who actor={entry.actor} className="hidden sm:block" />
      <div className="min-w-0">
        <p className={cn("text-ui", bad ? "font-medium text-north" : person ? "font-medium text-ink" : "text-ink-soft")}>
          <Sentence entry={entry} />
        </p>
        <p className="mt-0.5 text-meta text-muted sm:hidden">
          {actorParts(entry.actor).name}
          {scope === "all" ? ` · ${fmtTime(entry.occurred_at)}` : ""}
        </p>
        {scope === "all" ? <p className="mt-0.5 hidden text-meta text-muted tabular-nums sm:block">{fmtTime(entry.occurred_at)}</p> : null}
      </div>
      <Pos entry={entry} bad={bad} />
    </li>
  );
}

/** A folded run of one machine's repeated act; "göster" opens the original rows. */
function Run({ entries, actor, action, scope, broken }: { entries: readonly AuditEntry[]; actor: string; action: string; scope: Scope; broken: number | null }) {
  const newest = entries[0] as AuditEntry;
  const hasBroken = broken !== null && entries.some((e) => e.chain_pos === broken);
  return (
    <li>
      <details className="group" open={hasBroken || undefined}>
        <summary className={cn(GRID, "cursor-pointer list-none items-center py-2.5 hover:bg-wash-tint [&::-webkit-details-marker]:hidden")}>
          <When iso={newest.occurred_at} scope={scope} />
          <Who actor={actor} className="hidden sm:block" />
          <span className="min-w-0">
            <span className="block text-ui text-ink-soft tabular-nums">{runSentence(actorParts(actor).name, action, entries.length)}</span>
            <span className="mt-0.5 block text-meta text-muted tabular-nums">
              {runMeta(entries)} ·{" "}
              <span className="text-ink underline decoration-rule-soft underline-offset-4 group-hover:decoration-ink">
                <span className="group-open:hidden">göster</span>
                <span className="hidden group-open:inline">gizle</span>
              </span>
            </span>
          </span>
          <span className="text-right text-dense whitespace-nowrap text-muted tabular-nums">{fmtInt(entries.length)} kayıt</span>
        </summary>
        <ol className="divide-y divide-hairline border-t border-hairline bg-sunk/40">
          {entries.map((e) => (
            <Row key={e.chain_pos} entry={e} scope={scope} broken={broken} />
          ))}
        </ol>
      </details>
    </li>
  );
}
