"use client";

import { useState } from "react";
import Link from "next/link";
import type { ApprovalCard, OrderTicket } from "@/lib/domain";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { ROUTES } from "@/lib/nav";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { effectiveStatus } from "@/components/approvals/approvals-logic";
import { useDesk } from "@/components/shell/desk-state";
import { ErrorState, Skeleton, SkeletonLines } from "@/components/ui/primitives";
import { crewLead, crewLines, plainHistory, riskView } from "@/components/story/plain";
import { BigSentence } from "@/components/story/ui";
import { CrewVoices } from "./crew-voices";
import { Decision } from "./decision";
import { Details, detailsMeta } from "./details";
import { Disclosure } from "./disclosure";
import { Notes } from "./notes";
import { ProposalHeader } from "./proposal-header";
import { ProposalSummary } from "./summary";
import { WhySections } from "./why";

/**
 * /oneri/[id]: one proposal and its decision. On top: what happened, the proposal in figures
 * (amount, risk, deadline), then the decision box (two signatures, Onayla / Reddet) and, once
 * signed, the emir fişi. The reasons, the crew's notes, the team's notes and all details sit
 * below in four collapsed sections.
 */
export function ProposalScreen({ proposalId }: { proposalId: string }) {
  const now = useNow(30_000);
  const desk = useDesk();
  const cards = useApiQuery((api) => api.listApprovals("all"), [proposalId]);
  const limits = useApiQuery((api) => api.limits(), []);
  const [decided, setDecided] = useState<ApprovalCard | null>(null);
  const [signedHere, setSignedHere] = useState(false);
  const [liveTicket, setLiveTicket] = useState<OrderTicket | null>(null);

  // Bugün already holds the open proposals: start from that card so explain() starts at once.
  const seeded = desk.pending.find((c) => c.proposal_id === proposalId) ?? null;
  const fetched = cards.data?.find((c) => c.proposal_id === proposalId) ?? null;
  const card = decided && decided.proposal_id === proposalId ? decided : (fetched ?? (cards.data ? null : seeded));
  const runId = card?.run_id ?? null;
  const ex = useApiQuery((api) => (runId ? api.explain(runId) : Promise.resolve(null)), [runId, card?.status]);
  const explain = ex.data && ex.data.run.run_id === runId ? ex.data : null;

  useEventStream("desk", {
    "approval.requested": (c) => (c.proposal_id === proposalId ? void cards.refetch() : undefined),
    "approval.decided": (c) => (c.proposal_id === proposalId ? setDecided(c) : undefined),
    ticket: (t) => (t.proposal_id === proposalId ? setLiveTicket(t) : undefined),
  });

  if (cards.error && !cards.data && !card) return <ErrorState message={cards.error} onRetry={cards.refetch} />;
  if (cards.loading && !card) return <Loading />;
  if (!card) {
    return (
      <div className="space-y-4">
        <BigSentence focusTarget className="text-[32px] leading-[38px] sm:text-[40px] sm:leading-[46px]">
          Bu öneri bulunamadı.
        </BigSentence>
        <p className="text-[16px] leading-6 text-ink-soft">
          Süresi dolmuş ya da veriler sıfırlanmış olabilir.{" "}
          <Link href={ROUTES.bugun} className="font-medium text-ink underline underline-offset-4">
            Bugün’e dön
          </Link>
        </p>
      </div>
    );
  }

  const onDecidedHere = (c: ApprovalCard) => {
    setDecided(c);
    if (c.status === "approved") setSignedHere(true);
  };
  const status = effectiveStatus(card, now);
  const ticket = liveTicket ?? explain?.ticket ?? null;
  const risk = riskView(card, explain?.proposal?.stop_price);
  const perTrade = limits.data?.active.values.find((v) => v.key === "risk_per_trade_pct")?.value ?? null;
  const equity = desk.risk?.equity ?? null;
  const perTradeCap = perTrade !== null && equity !== null && perTrade > 0 && equity > 0 ? perTrade * equity : null;
  const lines = crewLines(card, explain);

  return (
    <article aria-labelledby="oneri-baslik" className="max-w-[800px] animate-fade-in space-y-8">
      <ProposalHeader card={card} status={status} />

      <ProposalSummary card={card} status={status} risk={risk} riskLoading={ex.loading} perTradeCap={perTradeCap} equity={equity} nowMs={now} />

      <Decision card={card} status={status} ticket={ticket} justSigned={signedHere && status === "approved"} onDecided={onDecidedHere} />

      <div className="border border-rule-soft bg-panel">
        <Disclosure id="neden" title="Neden bu öneri?" meta={plainHistory(card.evidence_summary, explain?.evidence_events)}>
          <WhySections card={card} explain={explain} />
        </Disclosure>
        <Disclosure id="tayfa" title="Tayfa ne dedi?" meta={crewLead(lines, card)}>
          <CrewVoices card={card} explain={explain} loading={ex.loading} />
        </Disclosure>
        <Notes card={card} />
        <Disclosure id="ayrintilar" title="Ayrıntılar" meta={detailsMeta(card, explain)}>
          <Details card={card} explain={explain} />
        </Disclosure>
      </div>
    </article>
  );
}

function Loading() {
  return (
    <div className="max-w-[800px] space-y-6" role="status" aria-label="Öneri yükleniyor">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-12 w-5/6" />
      <Skeleton className="h-40 w-full" />
      <SkeletonLines lines={3} />
    </div>
  );
}
