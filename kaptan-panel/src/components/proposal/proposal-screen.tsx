"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ApprovalCard, OrderTicket } from "@/lib/domain";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { ROUTES } from "@/lib/nav";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { effectiveStatus } from "@/components/approvals/approvals-logic";
import { useDesk } from "@/components/shell/desk-state";
import { ErrorState, Skeleton, SkeletonLines } from "@/components/ui/primitives";
import { crewLead, crewLines } from "@/components/story/plain";
import { BigSentence } from "@/components/story/ui";
import { CrewVoices } from "./crew-voices";
import { Decision } from "./decision";
import { Details, detailsMeta } from "./details";
import { Disclosure } from "./disclosure";
import { Notes } from "./notes";
import { ProposalHeader } from "./proposal-header";
import { Story } from "./story";
import { routeArrived } from "./view-transition";
import "./oneri.css";
import "./oneri-page.css";

/**
 * /oneri/[id], "Neden?": one big sentence with the verb, then a short story of the same evidence
 * in plain words, and the decision beside it (under it on a phone). Once approved, the decision
 * turns into what to enter at the bank. The checks, your notes and the technical record sit below,
 * collapsed.
 */
export function ProposalScreen({ proposalId }: { proposalId: string }) {
  const desk = useDesk();
  const now = useNow(30_000);
  const cards = useApiQuery((api) => api.listApprovals("all"), [proposalId]);
  const limits = useApiQuery((api) => api.limits(), []);
  const [decided, setDecided] = useState<ApprovalCard | null>(null);
  const [signedHere, setSignedHere] = useState(false);
  const [liveTicket, setLiveTicket] = useState<OrderTicket | null>(null);

  // The home already holds the open proposals: start from that card so explain() starts at once.
  const seeded = desk.pending.find((c) => c.proposal_id === proposalId) ?? null;
  const fetched = cards.data?.find((c) => c.proposal_id === proposalId) ?? null;
  const card = decided && decided.proposal_id === proposalId ? decided : (fetched ?? (cards.data ? null : seeded));
  const runId = card?.run_id ?? null;
  const ex = useApiQuery((api) => (runId ? api.explain(runId) : Promise.resolve(null)), [runId, card?.status]);
  const explain = ex.data && ex.data.run.run_id === runId ? ex.data : null;

  useEffect(() => routeArrived(), []);

  useEventStream("desk", {
    "approval.requested": (c) => (c.proposal_id === proposalId ? void cards.refetch() : undefined),
    "approval.decided": (c) => (c.proposal_id === proposalId ? setDecided(c) : undefined),
    ticket: (t) => (t.proposal_id === proposalId ? setLiveTicket(t) : undefined),
    fill: (f) => (f.ticker === card?.ticker ? void ex.refetch() : undefined),
  });

  if (cards.error && !cards.data && !card) return <ErrorState message={cards.error} onRetry={cards.refetch} />;
  if (cards.loading && !card) return <Loading />;
  if (!card) {
    return (
      <div className="space-y-4">
        <BigSentence focusTarget>Bu öneri bulunamadı.</BigSentence>
        <p className="text-[16px] leading-6 text-ink-soft">
          Süresi dolmuş ya da veriler sıfırlanmış olabilir.{" "}
          <Link href={ROUTES.benim} className="font-medium text-ink underline underline-offset-4">
            Ana sayfa’ya dön
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
  const perTrade = limits.data?.active.values.find((v) => v.key === "risk_per_trade_pct")?.value ?? null;
  const equity = desk.risk?.equity ?? null;
  const lines = crewLines(card, explain);

  return (
    <article aria-labelledby="oneri-baslik" className="oneri-page">
      <ProposalHeader card={card} status={status} />
      <div className="oneri-columns">
        <Story card={card} explain={explain} equity={equity} perTrade={perTrade} />
        <Decision
          card={card}
          status={status}
          ticket={ticket}
          justSigned={signedHere && status === "approved"}
          onDecided={onDecidedHere}
        />
      </div>
      <div className="oneri-more">
        <Disclosure id="tayfa" title="KAPtan neye baktı?" meta={crewLead(lines, card)}>
          <CrewVoices lines={lines} loading={ex.loading} />
        </Disclosure>
        <Notes card={card} />
        <Disclosure id="ayrintilar" title="Teknik kayıt" meta={detailsMeta(card, explain)}>
          <Details card={card} explain={explain} />
        </Disclosure>
      </div>
    </article>
  );
}

function Loading() {
  return (
    <div className="max-w-[960px] space-y-6" role="status" aria-label="Öneri yükleniyor">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-40 w-1/2" />
      <Skeleton className="h-12 w-5/6" />
      <SkeletonLines lines={3} />
    </div>
  );
}
