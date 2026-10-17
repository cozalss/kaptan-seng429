import Link from "next/link";
import type { ApprovalCard } from "@/lib/domain";
import { EVENT_LABEL } from "@/lib/domain";
import { href } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { withNums } from "@/components/story/num";
import { cardFooterLine, plainEvent, shortName } from "@/components/story/plain";
import { titleTr } from "@/components/story/turkish";

/**
 * One proposal on Bugün, as a row of a ruled list (not a box): what kind of news, the company,
 * where it stands in the two signatures, what happened in one Bodoni line, the suggestion and
 * İncele. The whole row is the link target; under the pointer it is washed edge to edge and the
 * arrow steps forward. A proposal that just arrived is set down once and carries a wash mark.
 */
export function ProposalCard({
  card,
  fresh = false,
  nowIso,
  yours = false,
}: {
  card: ApprovalCard;
  fresh?: boolean;
  nowIso: string | null;
  /** The person looking is the Risk Sorumlusu: the second signature is theirs. */
  yours?: boolean;
}) {
  const name = shortName(card.company_name);
  const kind = EVENT_LABEL[card.event_type === "EXIT" ? "IGNORE" : card.event_type].tr.toLocaleLowerCase("tr-TR");
  return (
    // The accessible name keeps the registry spelling ("ÖRNEK ENERJİ"); the eye reads it in title case.
    <article
      aria-label={name}
      className={cn(
        "group relative py-6 transition-colors duration-[var(--dur-quick)] ease-[var(--ease-ink)] hover:bg-wash-tint active:bg-wash-tint-strong sm:-mx-4 sm:px-4",
        "has-[a:focus-visible]:bg-wash-tint",
        fresh && "animate-card-arrive",
      )}
    >
      {fresh ? <span aria-hidden className="absolute top-6 bottom-6 left-0 hidden w-[3px] bg-wash sm:block" /> : null}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <span className="text-ui font-medium tracking-normal text-ink">{titleTr(name)}</span>
          <span className="text-meta text-muted">{kind}</span>
          {fresh ? <span className="bg-wash px-1.5 text-meta font-semibold text-on-dark">yeni</span> : null}
        </p>
        <Signatures yours={yours} />
      </div>
      <h2 className="mt-2 max-w-[30ch] font-display-text text-title text-balance text-ink">{withNums(plainEvent(card))}</h2>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="text-ui text-ink-soft tabular-nums">{cardFooterLine(card, nowIso)}</p>
        <Link
          href={href.proposal(card.proposal_id)}
          aria-label={`İncele: ${name}`}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-ui font-medium text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-brand sm:min-h-0"
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

/**
 * Where an open proposal stands in the two signatures: the rules' mark is inked (1/2), the
 * Risk Sorumlusu's is an empty square in its umber, waiting. Said in words for screen readers.
 */
function Signatures({ yours }: { yours: boolean }) {
  return (
    <p className="tone-risk_officer flex shrink-0 items-center gap-2 text-meta text-ink-soft">
      <span aria-hidden className="flex items-center gap-[3px]">
        <span className="size-[11px] bg-ink" />
        <span className="size-[11px] border-2 border-[var(--tone)]" />
      </span>
      <span className="sr-only">İmzalar: kurallar imzaladı;</span>
      <span>
        <span aria-hidden className="tabular-nums">1/2 · </span>
        {yours ? <span className="font-semibold text-[var(--tone)]">ikinci imza senin</span> : "ikinci imza Risk Sorumlusu’nun"}
      </span>
    </p>
  );
}
