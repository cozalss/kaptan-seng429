"use client";

import { useState } from "react";
import Link from "next/link";
import type { ApprovalCard, OrderTicket } from "@/lib/domain";
import { IS_MOCK } from "@/lib/api/config";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { fmtPrice, fmtTime, fmtTry } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { effectiveStatus } from "@/components/approvals/approvals-logic";
import { ErrorState, Skeleton, SkeletonLines } from "@/components/ui/primitives";
import { plainEvent, plainHistory, plainWhy, riskView, shortName } from "@/components/story/plain";
import { locative } from "@/components/story/turkish";
import { BigSentence, CodeTag, Fleuron, Kicker, SampleTag, StorySection } from "@/components/story/ui";
import { CrewPath } from "./crew-path";
import { CrewVoices } from "./crew-voices";
import { Decision } from "./decision";
import { Details } from "./details";
import { HistoryStrip } from "./history-strip";
import { Notes } from "./notes";
import { SignatureChain } from "./signatures";

/**
 * /oneri/[id] — the decision, told as a short story: Ne oldu → Neden önemli → Geçmişte ne
 * oldu → Tayfa ne dedi → Risk → Öneri. One action: Onayla (Reddet is a quiet link). After an
 * approval the emir fişi takes the Öneri's place.
 */
export function ProposalScreen({ proposalId }: { proposalId: string }) {
  const now = useNow(30_000);
  const cards = useApiQuery((api) => api.listApprovals("all"), [proposalId]);
  const [decided, setDecided] = useState<ApprovalCard | null>(null);
  const [liveTicket, setLiveTicket] = useState<OrderTicket | null>(null);

  const fetched = cards.data?.find((c) => c.proposal_id === proposalId) ?? null;
  const card = decided && decided.proposal_id === proposalId ? decided : fetched;
  const runId = card?.run_id ?? null;
  const ex = useApiQuery((api) => (runId ? api.explain(runId) : Promise.resolve(null)), [runId, card?.status]);
  const explain = ex.data && ex.data.run.run_id === runId ? ex.data : null;

  useEventStream("desk", {
    "approval.requested": (c) => (c.proposal_id === proposalId ? void cards.refetch() : undefined),
    "approval.decided": (c) => (c.proposal_id === proposalId ? setDecided(c) : undefined),
    ticket: (t) => (t.proposal_id === proposalId ? setLiveTicket(t) : undefined),
  });

  if (cards.error && !cards.data) return <ErrorState message={cards.error} onRetry={cards.refetch} />;
  if (cards.loading) return <Loading />;
  if (!card) {
    return (
      <div className="space-y-6">
        <BigSentence>Bu öneri bulunamadı.</BigSentence>
        <p className="text-[17px] text-ink-soft">
          Süresi dolmuş ya da veriler sıfırlanmış olabilir.{" "}
          <Link href={ROUTES.bugun} className="font-medium text-ink underline underline-offset-4">
            Bugün’e dön
          </Link>
        </p>
      </div>
    );
  }

  const status = effectiveStatus(card, now);
  const ticket = liveTicket ?? explain?.ticket ?? null;
  const risk = riskView(card, explain?.proposal?.stop_price);
  const quote = disclosureQuote(explain?.texts[0]?.body);
  const publishedAt = explain?.disclosure.published_at ?? card.created_at;

  return (
    <article aria-labelledby="oneri-baslik" className="space-y-14">
      <header className="space-y-5">
        <Link href={ROUTES.bugun} className="group inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
          <span aria-hidden className="transition-transform duration-[var(--dur-quick)] group-hover:-translate-x-0.5">
            ←
          </span>
          Bugün
        </Link>
        <Kicker className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-medium tracking-[0.03em] text-ink">{shortName(card.company_name)}</span>
          <CodeTag>{card.ticker}</CodeTag>
          <CodeTag>{card.event_type}</CodeTag>
        </Kicker>
        <BigSentence id="oneri-baslik">{plainEvent(card)}</BigSentence>
        <CrewPath decided={status !== "pending"} />
      </header>

      <div className="space-y-11">
        <StorySection label="Ne oldu?">
          <p>
            {shortName(card.company_name)}, {locative(fmtTime(publishedAt))} KAP’a bir bildirim gönderdi: {card.sub_type_tr.toLocaleLowerCase("tr-TR")}.
          </p>
          {quote ? (
            <blockquote className="mt-4 border-l-[1.5px] border-ink pl-4 font-display text-[19px] leading-[28px] text-ink-soft italic">
              “{quote}”
            </blockquote>
          ) : null}
        </StorySection>

        <StorySection label="Neden önemli?">
          <p>{plainWhy(card)}</p>
        </StorySection>

        <StorySection label="Geçmişte ne oldu?" aside={IS_MOCK ? <SampleTag /> : null}>
          <p>{plainHistory(card.evidence_summary)}</p>
          {explain?.evidence_events.length ? <HistoryStrip events={explain.evidence_events} median={card.evidence_summary.median_car_5d} total={card.evidence_summary.n} /> : null}
          <p className="mt-2 text-[14px] leading-[21px] text-muted">Geçmiş, geleceğin sözü değildir.</p>
        </StorySection>

        <StorySection label="Tayfa ne dedi?">
          <CrewVoices card={card} explain={explain} loading={ex.loading} />
        </StorySection>

        <StorySection label="Risk">
          {risk ? (
            <p>
              Fiyat <span className="tabular-nums">{fmtPrice(risk.stopPrice)}</span>’ye inerse çıkılır. En kötü durumda kaybın yaklaşık{" "}
              <span className="font-medium tabular-nums">{fmtTry(risk.maxLoss)}</span> olur.
            </p>
          ) : ex.loading ? (
            <SkeletonLines lines={2} />
          ) : (
            <p>Zarar durdurma seviyesi bu öneride yok; risk kapısının sınırları geçerli.</p>
          )}
        </StorySection>
      </div>

      <Fleuron />

      <SignatureChain card={card} status={status} />

      <Decision card={card} status={status} nowMs={now} ticket={ticket} onDecided={setDecided} />

      <Notes card={card} />

      {explain ? <Details card={card} explain={explain} /> : null}
    </article>
  );
}

/** The disclosure's first real sentence (after the title line), for the quote under "Ne oldu?". */
export function disclosureQuote(body: string | undefined): string | null {
  if (!body) return null;
  const paragraphs = body.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const para = paragraphs[1] ?? null;
  if (!para) return null;
  const sentence = para.split(/(?<=\.)\s/)[0] ?? para;
  return sentence.length > 260 ? `${sentence.slice(0, 257).trimEnd()}…` : sentence;
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
