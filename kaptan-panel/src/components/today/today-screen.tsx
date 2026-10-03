"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ApprovalCard } from "@/lib/domain";
import { useNow } from "@/lib/clock";
import { fmtDateLong, fmtSignedPct, fmtTry } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { effectiveStatus, sortQueue } from "@/components/approvals/approvals-logic";
import { useDesk } from "@/components/shell/desk-state";
import { Skeleton } from "@/components/ui/primitives";
import { crewDayLine, deadlineLine, todayHeadline } from "@/components/story/plain";
import { BigSentence, Kicker, Lead } from "@/components/story/ui";
import { ProposalCard } from "./proposal-card";

/**
 * /bugun — the home screen. One big sentence, the open proposals as quiet cards, one line
 * about your money and one about the crew. A proposal that arrives while you look is inked in.
 */
export function TodayScreen() {
  const { pending, risk, counters } = useDesk();
  const now = useNow(30_000);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  useEventStream("desk", {
    "approval.requested": (card) => setFresh((s) => new Set(s).add(card.proposal_id)),
  });

  const open = useMemo(() => sortQueue(pending, now).filter((c) => effectiveStatus(c, now) === "pending"), [pending, now]);
  const stopped = risk?.kill_switch === "on";
  const loading = risk === null;
  const first: ApprovalCard | undefined = open[0];
  const crew = crewDayLine(counters);

  return (
    <div className="space-y-12">
      <header className="space-y-4">
        <Kicker>{now === null ? " " : fmtDateLong(new Date(now).toISOString())}</Kicker>
        {loading ? (
          <Skeleton className="h-12 w-3/4" />
        ) : (
          <BigSentence>{todayHeadline(stopped ? 0 : open.length, stopped)}</BigSentence>
        )}
        {!stopped && first ? <Lead>{deadlineLine(first.expires_at, now)}</Lead> : null}
        {crew ? <p className="max-w-[560px] text-[15px] leading-[23px] text-muted">{crew}</p> : null}
      </header>

      {!stopped && open.length ? (
        <ol aria-label="Bekleyen öneriler" className="space-y-5">
          {open.map((c) => (
            <li key={c.proposal_id}>
              <ProposalCard card={c} fresh={fresh.has(c.proposal_id)} />
            </li>
          ))}
        </ol>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {fresh.size ? `Yeni öneri geldi: ${open.find((c) => fresh.has(c.proposal_id))?.company_name ?? ""}` : ""}
      </p>

      {risk ? (
        <Link
          href={ROUTES.portfoy}
          className="group flex items-baseline gap-2 border-t border-hairline pt-5 text-[16px] text-ink-soft transition-colors hover:text-ink"
        >
          <span>
            Portföyün: <span className="font-medium text-ink tabular-nums">{fmtTry(risk.equity)}</span>
            <span aria-hidden className="mx-2 text-rule-soft">·</span>
            bugün <span className="tabular-nums">{fmtSignedPct(risk.daily_pnl_pct, 2)}</span>
          </span>
          <span aria-hidden className="transition-transform duration-[var(--dur-quick)] ease-[var(--ease-ink)] group-hover:translate-x-1">
            →
          </span>
        </Link>
      ) : null}
    </div>
  );
}
