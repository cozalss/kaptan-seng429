import Link from "next/link";
import type { ApprovalCard } from "@/lib/domain";
import { EVENT_LABEL } from "@/lib/domain";
import { fmtInt, fmtPrice, fmtTime, fmtTry } from "@/lib/format";
import { href } from "@/lib/nav";
import { dayWordTr } from "@/lib/time";
import { cn } from "@/lib/utils";
import { plainEvent, shortName } from "@/components/story/plain";
import { titleTr } from "@/components/story/turkish";
import { SIDE_LABEL } from "@/components/tickets/ticket-logic";

/** "yarın 09:50" (or just "09:50" before the clock is known). */
function deadline(card: Pick<ApprovalCard, "expires_at">, nowIso: string | null): string {
  const at = fmtTime(card.expires_at);
  return nowIso ? `${dayWordTr(card.expires_at, nowIso)} ${at}` : at;
}

/**
 * One proposal on Bugün, as a row of the list: the company and the kind of news, what
 * happened in one line, the amount, the deadline and where it stands in the two signatures,
 * then İncele. The whole row is the link target. A proposal that just arrived is set down once
 * and says "yeni".
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
  const kind = EVENT_LABEL[card.event_type === "EXIT" ? "IGNORE" : card.event_type].tr;
  return (
    // The accessible name keeps the registry spelling ("ÖRNEK ENERJİ"); the eye reads it in title case.
    <article
      aria-label={name}
      className={cn(
        "group relative grid gap-x-8 gap-y-3 px-4 py-5 transition-colors duration-[var(--dur-quick)] ease-[var(--ease-ink)] hover:bg-wash-tint sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6",
        "has-[a:focus-visible]:bg-wash-tint",
        fresh && "animate-card-arrive",
      )}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span
            data-side={card.side}
            className={cn("px-1.5 text-meta font-semibold text-on-dark", card.side === "sell" ? "bg-loss" : "bg-gain")}
          >
            {SIDE_LABEL[card.side]}
          </span>
          <span className="text-body font-semibold text-ink">{titleTr(name)}</span>
          <span className="text-meta text-ink-soft">{kind}</span>
          {fresh ? <span className="bg-brand px-1.5 text-meta font-semibold text-on-dark">yeni</span> : null}
        </p>
        <h2 className="mt-1 text-ui text-ink-soft">{plainEvent(card)}</h2>
        <Signatures yours={yours} />
      </div>

      <div className="flex items-end justify-between gap-6 sm:flex-col sm:items-end sm:justify-start sm:gap-1 sm:text-right">
        <p className="tabular-nums">
          <span className="block text-body font-semibold text-ink">{fmtTry(card.final_notional_try)}</span>
          <span className="block text-meta text-ink-soft">
            {fmtInt(card.qty)} lot · en fazla {fmtPrice(card.limit_price)}
          </span>
          <span className="block text-meta text-ink-soft">Son saat {deadline(card, nowIso)}</span>
        </p>
        <Link
          href={href.proposal(card.proposal_id)}
          aria-label={`İncele: ${name}`}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-ui font-semibold text-brand after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-brand sm:mt-2 sm:min-h-0"
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
 * Where an open proposal stands in the two signatures, as plain text and colour: the rules
 * have signed (1/2); the second signature is the Risk Sorumlusu's. Said in words for screen readers.
 */
function Signatures({ yours }: { yours: boolean }) {
  return (
    <p className="tone-risk_officer mt-3 text-meta text-ink-soft">
      <span className="sr-only">İmzalar: kurallar imzaladı;</span>
      <span aria-hidden className="font-semibold text-ink tabular-nums">
        İmza 1/2 ·{" "}
      </span>
      {yours ? <span className="font-semibold text-[var(--tone)]">ikinci imza senin</span> : "ikinci imza Risk Sorumlusu’nun"}
    </p>
  );
}
