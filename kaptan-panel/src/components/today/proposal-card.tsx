import Link from "next/link";
import type { ApprovalCard } from "@/lib/domain";
import { EVENT_LABEL } from "@/lib/domain";
import { href } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { plainEvent, shortName, suggestionLine } from "@/components/story/plain";
import { CodeTag } from "@/components/story/ui";

/**
 * One proposal on Bugün: the company, what happened in plain words, the suggestion, İncele.
 * The whole sheet is the link target; a proposal that just arrived is inked in once.
 */
export function ProposalCard({ card, fresh = false }: { card: ApprovalCard; fresh?: boolean }) {
  const titleId = `kart-${card.proposal_id}`;
  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "group relative border-[1.5px] border-ink bg-panel px-5 pt-5 pb-4 sm:px-7 sm:pt-6",
        "transition-[transform,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-ink)] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-ink",
        fresh && "animate-card-arrive",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="text-[15px] font-medium tracking-[0.03em] text-ink">
          {shortName(card.company_name)}
        </h2>
        <span className="flex shrink-0 items-center gap-2">
          {fresh ? <span className="text-[12px] font-medium text-wash">yeni</span> : null}
          <CodeTag title={EVENT_LABEL[card.event_type === "EXIT" ? "IGNORE" : card.event_type].tr}>{card.event_type}</CodeTag>
        </span>
      </div>
      <p className="mt-2 font-display text-[25px] leading-[1.18] text-balance text-ink sm:text-[28px]">{plainEvent(card)}</p>
      <div className="mt-5 flex items-center justify-between gap-4 border-t border-hairline pt-3.5">
        <p className="text-[15px] text-ink-soft tabular-nums">{suggestionLine(card)}</p>
        <Link
          href={href.proposal(card.proposal_id)}
          aria-label={`İncele: ${shortName(card.company_name)}`}
          className="inline-flex shrink-0 items-center gap-1.5 text-[15px] font-medium text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-brand"
        >
          İncele
          <span aria-hidden className="transition-transform duration-[var(--dur-quick)] ease-[var(--ease-ink)] group-hover:translate-x-1">
            →
          </span>
        </Link>
      </div>
    </article>
  );
}
