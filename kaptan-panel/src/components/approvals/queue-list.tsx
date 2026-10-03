"use client";

import type { ApprovalCard } from "@/lib/domain";
import { fmtDuration, fmtInt, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, EventBadge } from "@/components/ui/badge";
import { effectiveStatus, isOpen, STATUS_LABEL } from "./approvals-logic";

/**
 * The queue: one ruled slip per proposal. Open slips first (soonest 09:50 first); a slip that
 * arrived over SSE is inked in and marked until it is looked at.
 */
export function QueueList({
  cards,
  selectedId,
  fresh,
  nowMs,
  onSelect,
}: {
  cards: readonly ApprovalCard[];
  selectedId: string | null;
  fresh: ReadonlySet<string>;
  nowMs: number | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-hairline" aria-label="Öneriler">
      {cards.map((c) => {
        const status = effectiveStatus(c, nowMs);
        const open = isOpen(status);
        const selected = c.proposal_id === selectedId;
        const left = nowMs === null ? null : Date.parse(c.expires_at) - nowMs;
        return (
          <li key={c.proposal_id} className={cn(fresh.has(c.proposal_id) && "animate-ink-in")}>
            <button
              type="button"
              id={`oneri-${c.proposal_id}`}
              onClick={() => onSelect(c.proposal_id)}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "block w-full px-3 py-2.5 text-left outline-none",
                "hover:bg-wash-tint focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
                selected && "bg-wash-tint shadow-[inset_3px_0_0_var(--ink)]",
              )}
            >
              <span className="flex items-center gap-2">
                <span className={cn("code text-[15px] font-medium", open ? "text-ink" : "text-ink-soft")}>{c.ticker}</span>
                <EventBadge type={c.event_type === "EXIT" ? "IGNORE" : c.event_type} compact />
                {c.level === "escalate" ? <Badge tone="wash">escalate</Badge> : null}
                {fresh.has(c.proposal_id) ? (
                  <span className="inline-flex items-center gap-1 text-meta text-wash">
                    <span aria-hidden className="size-1.5 bg-wash" /> yeni
                  </span>
                ) : null}
                <span className="ml-auto text-dense font-medium text-ink tabular-nums">{fmtInt(c.final_notional_try)} TL</span>
              </span>
              <span className={cn("mt-0.5 block truncate text-dense", open ? "text-ink-soft" : "text-muted")}>{c.headline_tr}</span>
              <span className="mt-1 flex items-center gap-2 text-meta text-muted">
                {open ? (
                  <span className={cn("tabular-nums", left !== null && left > 0 && left < 15 * 60_000 && "text-north")}>
                    Düşmesine {left === null ? "…" : fmtDuration(left)}
                  </span>
                ) : (
                  <span className={cn(status === "rejected" && "text-north", status === "approved" && "text-ink")}>
                    {STATUS_LABEL[status]}
                    {c.decided_at ? ` · ${fmtTime(c.decided_at)}` : ""}
                  </span>
                )}
                {c.is_fixture ? <span className="ml-auto">DEMO FİKSTÜRÜ</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
