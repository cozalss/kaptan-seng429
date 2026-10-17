"use client";

import { memo, useMemo } from "react";
import type { AuditEntry } from "@/lib/domain";
import { memberByUid } from "@/lib/domain/user";
import { actorParts } from "@/lib/actors";
import { auditCompany, auditSentence } from "@/lib/audit-words";
import { fmtInt, fmtShortDate, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RoleEmblem } from "@/components/roles/role-emblem";
import { groupRuns, runMeta } from "./ledger-runs";

export type Scope = "today" | "all";

/** The id a record's row carries, so "Defterde göster →" can scroll to it. */
export const rowId = (pos: number) => `kayit-${pos}`;

/**
 * The ledger as a ruled list: when, who did what (one sentence), and the record's place in the
 * chain with its fingerprint. A person's act wears that role's tone ink (a bar and the emblem);
 * the machines' routine work is set a shade softer, and the KAP okuyucu's runs fold into one line.
 */
export const Timeline = memo(function Timeline({ items, scope, broken }: { items: readonly AuditEntry[]; scope: Scope; broken: number | null }) {
  const rows = useMemo(() => groupRuns(items), [items]);
  return (
    <ol aria-label="Denetim kayıtları" className="animate-fade-in divide-y divide-hairline border-y-2 border-ink">
      {rows.map((r) =>
        r.kind === "one" ? (
          <Row key={r.entry.chain_pos} entry={r.entry} scope={scope} broken={broken} />
        ) : (
          <Run key={`run-${r.entries[0]?.chain_pos}`} entries={r.entries} actor={r.actor} scope={scope} broken={broken} />
        ),
      )}
    </ol>
  );
});

const GRID = "grid grid-cols-[52px_minmax(0,1fr)] gap-x-4 py-3.5 sm:grid-cols-[64px_minmax(0,1fr)_auto]";

function When({ iso, scope }: { iso: string; scope: Scope }) {
  return (
    <time dateTime={iso} className="pt-[2px] text-ui text-ink tabular-nums">
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

function Fingerprint({ entry, bad }: { entry: AuditEntry; bad: boolean }) {
  return (
    <span className="col-start-2 mt-1 flex items-baseline gap-2 self-start sm:col-start-3 sm:mt-[3px]">
      <span className={cn("code text-meta font-semibold tabular-nums", bad ? "text-north" : "text-ink")}>#{fmtInt(entry.chain_pos)}</span>
      <span className={cn("code text-meta", bad ? "text-north" : "text-ink-soft")} title={`parmak izi (hash): ${entry.hash}`}>
        {entry.hash.slice(0, 8)}
      </span>
    </span>
  );
}

function Row({ entry, scope, broken }: { entry: AuditEntry; scope: Scope; broken: number | null }) {
  const who = actorParts(entry.actor);
  const person = memberByUid(entry.actor);
  const bad = broken !== null && entry.chain_pos === broken;
  return (
    <li
      id={rowId(entry.chain_pos)}
      className={cn(
        GRID,
        "scroll-mt-24",
        (person || bad) && "relative before:absolute before:top-3 before:bottom-3 before:-left-3 before:w-[4px]",
        // A person's act: the role's tone as a margin bar and a faint wash of the same ink.
        person && `tone-${person.role} -mx-3 bg-[var(--tone-wash)] px-3 before:left-0 before:bg-[var(--tone)]`,
        // The broken record: a north rule in the margin and a tint that keeps clear of the text.
        bad && "-mx-3 bg-north-tint px-3 before:left-0 before:bg-north",
      )}
    >
      <When iso={entry.occurred_at} scope={scope} />
      <div className="min-w-0">
        <p className={cn("text-[16px] leading-[24px]", bad ? "text-north" : person ? "font-medium text-ink" : "text-ink-soft")}>
          <Sentence entry={entry} />
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-dense text-muted">
          {person ? <RoleEmblem role={person.role} className="size-4 shrink-0 text-[var(--tone)]" /> : null}
          <span>
            {who.name}
            {who.kind ? ` · ${who.kind}` : ""}
            {scope === "all" ? ` · ${fmtTime(entry.occurred_at)}` : ""}
          </span>
        </p>
      </div>
      <Fingerprint entry={entry} bad={bad} />
    </li>
  );
}

/** A folded run of the KAP okuyucu's fetches; "göster" opens the original rows. */
function Run({ entries, actor, scope, broken }: { entries: readonly AuditEntry[]; actor: string; scope: Scope; broken: number | null }) {
  const newest = entries[0] as AuditEntry;
  const hasBroken = broken !== null && entries.some((e) => e.chain_pos === broken);
  return (
    <li className={cn(GRID, "sm:grid-cols-[64px_minmax(0,1fr)]")}>
      <When iso={newest.occurred_at} scope={scope} />
      <div className="min-w-0">
        <p className="text-[16px] leading-[24px] text-ink-soft tabular-nums">{`${actorParts(actor).name} ${fmtInt(entries.length)} bildirim getirdi.`}</p>
        <details className="group" open={hasBroken || undefined}>
          <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 text-dense text-muted sm:min-h-8 [&::-webkit-details-marker]:hidden">
            <span className="tabular-nums">{runMeta(entries)}</span>
            <span className="text-ink underline decoration-rule-ui underline-offset-4 group-hover:decoration-ink">
              <span className="group-open:hidden">göster</span>
              <span className="hidden group-open:inline">gizle</span>
            </span>
          </summary>
          <ol className="mt-1 divide-y divide-hairline border-t border-hairline">
            {entries.map((e) => (
              <Row key={e.chain_pos} entry={e} scope={scope} broken={broken} />
            ))}
          </ol>
        </details>
      </div>
    </li>
  );
}
