"use client";

import Link from "next/link";
import type { AuditEntry } from "@/lib/domain";
import { memberByUid } from "@/lib/domain/user";
import { actorParts } from "@/lib/actors";
import { auditSentence } from "@/lib/audit-words";
import { useApiQuery } from "@/lib/api/react";
import { fmtInt, fmtTime } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { cn } from "@/lib/utils";
import { groupRuns, type LedgerRow } from "@/components/audit/ledger-runs";
import { CARD, CardHead } from "@/components/portfolio/kit";
import { RoleEmblem } from "@/components/roles/role-emblem";
import { ErrorState, SkeletonLines } from "@/components/ui/primitives";

/** Rows on Bugün; the whole ledger is one click away. */
const SHOWN = 7;
/** Enough of today's tail that folded fetches still leave SHOWN rows. */
const FETCH = 60;

/**
 * "Son kayıtlar": the newest lines of today's ledger as a quiet feed (time, the sentence, who),
 * the KAP okuyucu's routine fetches folded into one line as on Denetim. Refreshes with the desk.
 */
export function AuditFeed({ className }: { className?: string }) {
  const q = useApiQuery((api) => api.auditList({ scope: "today", limit: FETCH }), []);
  useEventStream("desk", {
    "approval.decided": () => void q.refetch(),
    kill_switch: () => void q.refetch(),
    "limits.changed": () => void q.refetch(),
    ticket: () => void q.refetch(),
  });
  const rows = q.data ? groupRuns(q.data.items).slice(0, SHOWN) : null;

  return (
    <section aria-labelledby="son-kayitlar" className={cn(CARD, className)}>
      <CardHead
        id="son-kayitlar"
        title="Son kayıtlar"
        note={q.data ? `Defterde ${fmtInt(q.data.length)} kayıt` : "Denetim defterinden"}
        action={
          <Link href={ROUTES.denetim} className="text-dense font-semibold text-brand underline decoration-transparent underline-offset-4 hover:decoration-brand">
            Tümü →
          </Link>
        }
      />
      {q.error && !q.data ? (
        <div className="px-5 pb-5">
          <ErrorState message={q.error} onRetry={q.refetch} />
        </div>
      ) : rows ? (
        rows.length ? (
          <ol aria-label="Son kayıtlar" className="relative mx-5 mb-4 border-l border-line">
            {rows.map((r) => (
              <FeedRow key={r.kind === "one" ? r.entry.chain_pos : `run-${r.entries[0]?.chain_pos}`} row={r} />
            ))}
          </ol>
        ) : (
          <p className="px-5 pb-5 text-ui text-ink-soft">Bugün henüz kayıt yok.</p>
        )
      ) : (
        <SkeletonLines lines={5} className="px-5 pb-5" />
      )}
    </section>
  );
}

function FeedRow({ row }: { row: LedgerRow }) {
  const entry: AuditEntry = row.kind === "one" ? row.entry : (row.entries[0] as AuditEntry);
  const who = actorParts(entry.actor);
  const person = memberByUid(entry.actor);
  const text = row.kind === "one" ? auditSentence(entry) : `${who.name} ${fmtInt(row.entries.length)} bildirim getirdi.`;
  return (
    <li className="relative py-2 pl-4">
      <span aria-hidden className={cn("absolute top-[15px] -left-[4.5px] size-2 rounded-full ring-2 ring-panel", person ? "bg-brand" : "bg-[var(--flow-2)]")} />
      <p className={cn("text-dense", person ? "font-medium text-ink" : "text-ink-soft")}>{text}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-meta text-muted tabular-nums">
        <time dateTime={entry.occurred_at}>{fmtTime(entry.occurred_at)}</time>
        <span aria-hidden>·</span>
        {person ? <RoleEmblem role={person.role} className={cn(`tone-${person.role}`, "size-3 shrink-0 text-[var(--tone)]")} /> : null}
        <span className="truncate">{who.name}</span>
        <span aria-hidden>·</span>
        <span>#{fmtInt(entry.chain_pos)}</span>
      </p>
    </li>
  );
}
