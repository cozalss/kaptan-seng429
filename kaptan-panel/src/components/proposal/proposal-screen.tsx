"use client";

import { useState } from "react";
import Link from "next/link";
import type { ApprovalCard, OrderTicket } from "@/lib/domain";
import { IS_MOCK } from "@/lib/api/config";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { fmtTime } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { effectiveStatus } from "@/components/approvals/approvals-logic";
import { useDesk } from "@/components/shell/desk-state";
import { ErrorState, Skeleton, SkeletonLines } from "@/components/ui/primitives";
import { disclosureQuote, plainHistory, plainWhy, riskSentence, riskView, shortName } from "@/components/story/plain";
import { locative, titleTr } from "@/components/story/turkish";
import { BigSentence, SampleTag, StorySection } from "@/components/story/ui";
import { CrewVoices } from "./crew-voices";
import { Decision } from "./decision";
import { Details } from "./details";
import { HistoryStrip } from "./history-strip";
import { Notes } from "./notes";
import { ProposalHeader } from "./proposal-header";

/**
 * /oneri/[id]: the decision, told as a short story: Ne oldu → Neden önemli → Geçmişte ne
 * oldu → Tayfa ne dedi → Risk → Öneri. One action: Onayla (Reddet is quiet). After an approval
 * given here the emir fişi prints and the seal presses (İmza anı).
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
      <div className="space-y-6">
        <BigSentence focusTarget>Bu öneri bulunamadı.</BigSentence>
        <p className="text-body text-ink-soft">
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
  const quote = disclosureQuote(explain?.texts[0]?.body);
  const publishedAt = explain?.disclosure.published_at ?? card.created_at;
  const justSigned = signedHere && status === "approved";

  return (
    <article aria-labelledby="oneri-baslik" className="animate-fade-in space-y-16 sm:space-y-[72px]">
      <ProposalHeader card={card} />

      {/* The story reads down a thin ink thread (wide screens) that ends in the decision sheet. */}
      <div className="relative space-y-12 sm:pl-7">
        <span aria-hidden className="absolute top-2 bottom-[-72px] left-[3px] !m-0 hidden w-px bg-rule-soft sm:block" />
        <StorySection label="Ne oldu?" className={STEP}>
          <p>
            {titleTr(shortName(card.company_name))}, {locative(fmtTime(publishedAt))} KAP’a bir bildirim gönderdi: {card.sub_type_tr.toLocaleLowerCase("tr-TR")}.
          </p>
          {quote ? (
            <blockquote className="relative border-l-[1.5px] border-ink pl-5 font-display-text text-lead text-ink-soft">
              <span aria-hidden className="absolute top-0 left-[7px] text-ink-soft">
                “
              </span>
              {quote}”
            </blockquote>
          ) : null}
        </StorySection>

        <StorySection label="Neden önemli?" className={STEP}>
          <p>{plainWhy(card)}</p>
        </StorySection>

        <StorySection label="Geçmişte ne oldu?" aside={IS_MOCK ? <SampleTag /> : null} className={STEP}>
          <p>{plainHistory(card.evidence_summary, explain?.evidence_events)}</p>
          {explain?.evidence_events.length ? (
            <HistoryStrip events={explain.evidence_events} median={card.evidence_summary.median_car_5d} total={card.evidence_summary.n} />
          ) : ex.loading ? (
            <StripPlaceholder />
          ) : null}
          <p className="mt-2 text-dense text-muted">Geçmiş, geleceğin sözü değildir.</p>
        </StorySection>

        <StorySection label="Tayfa ne dedi?" className={STEP}>
          <CrewVoices card={card} explain={explain} loading={ex.loading} />
        </StorySection>

        <StorySection label="Risk" className={STEP}>
          {risk ? (
            <p>{riskSentence(risk, perTrade !== null && equity !== null ? { pct: perTrade, equity } : null)}</p>
          ) : ex.loading ? (
            <SkeletonLines lines={2} />
          ) : (
            <p>Zarar durdurma seviyesi bu öneride yok; risk kapısının sınırları geçerli.</p>
          )}
        </StorySection>
      </div>

      <Decision card={card} status={status} nowMs={now} ticket={ticket} risk={risk} justSigned={justSigned} onDecided={onDecidedHere} />

      <Notes card={card} />

      {explain ? <Details card={card} explain={explain} /> : null}
    </article>
  );
}

/** A story step on the thread: a small ink square on the line, level with the step's label. */
const STEP = "relative sm:before:absolute sm:before:top-[9px] sm:before:left-[-28px] sm:before:size-[7px] sm:before:bg-ink";

/** Holds the history strip's place while the run details load, so nothing jumps. */
function StripPlaceholder() {
  return (
    <div aria-hidden className="mt-5">
      <div className="h-7" />
      <div className="mt-2 h-[86px] bg-sunk/60" />
      <div className="mt-0.5 h-4" />
      <div className="mt-2 h-[22px]" />
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-8" role="status" aria-label="Öneri yükleniyor">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-14 w-5/6" />
      <SkeletonLines lines={4} />
      <SkeletonLines lines={3} />
    </div>
  );
}
