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
        "group relative grid gap-x-6 gap-y-3 px-5 py-4 transition-colors duration-[var(--dur-quick)] ease-[var(--ease-ink)] hover:bg-wash-tint grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center",
        "has-[a:focus-visible]:bg-wash-tint",
        fresh && "animate-card-arrive bg-wash-tint",
      )}
    >
      <div className="flex min-w-0 gap-3.5">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 grid h-10 w-12 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-semibold tracking-tight",
            card.side === "sell" ? "bg-loss/10 text-loss" : "bg-gain/10 text-gain",
          )}
        >
          {card.ticker}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-body font-semibold text-ink">{titleTr(name)}</span>
            <span
              data-side={card.side}
              className={cn("rounded-full px-2 text-meta leading-[20px] font-semibold text-on-dark", card.side === "sell" ? "bg-loss" : "bg-gain")}
            >
              {SIDE_LABEL[card.side]}
            </span>
            {fresh ? <span className="rounded-full bg-brand px-2 text-meta leading-[20px] font-semibold text-on-dark">yeni</span> : null}
            <span className="text-meta text-muted">{kind}</span>
          </p>
          <h2 className="mt-0.5 text-ui text-ink-soft">{plainEvent(card)}</h2>
          <Signatures yours={yours} />
        </div>
      </div>

      <p className="flex flex-wrap items-baseline gap-x-1.5 pl-[62px] text-meta text-ink-soft tabular-nums md:block md:pl-0 md:text-right">
        <span className="text-ui font-semibold text-ink md:block md:text-body">{fmtTry(card.final_notional_try)}</span>
        <span aria-hidden className="md:hidden">·</span>
        <span className="md:block">
          {fmtInt(card.qty)} lot<span className="max-md:hidden"> · {card.side === "sell" ? "en az" : "en fazla"} {fmtPrice(card.limit_price)}</span>
        </span>
        <span aria-hidden className="md:hidden">·</span>
        <span className="md:block">
          <span className="max-md:hidden">Son saat </span>
          {deadline(card, nowIso)}
        </span>
      </p>

      <Link
        href={href.proposal(card.proposal_id)}
        aria-label={`İncele: ${name}`}
        className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg md:h-10 md:w-auto md:justify-self-end border-[1.5px] border-rule-ui bg-panel px-3.5 text-ui font-semibold text-ink transition-colors duration-[var(--dur-quick)] after:absolute after:inset-0 after:content-[''] group-hover:border-brand group-hover:text-brand focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-brand "
      >
        İncele
        <span aria-hidden className="transition-transform duration-[var(--dur-quick)] ease-[var(--ease-ink)] group-hover:translate-x-0.5">
          →
        </span>
      </Link>
    </article>
  );
}

/**
 * Where an open proposal stands in the two signatures, as plain text and colour: the rules
 * have signed (1/2); the second signature is the Risk Sorumlusu's. Said in words for screen readers.
 */
function Signatures({ yours }: { yours: boolean }) {
  return (
    <p className="tone-risk_officer mt-2 inline-flex flex-wrap items-center gap-x-1 rounded-full bg-sunk px-2.5 py-0.5 text-meta text-ink-soft">
      <span className="sr-only">İmzalar: kurallar imzaladı;</span>
      <span aria-hidden className="font-semibold text-ink tabular-nums">
        İmza 1/2 ·{" "}
      </span>
      {yours ? <span className="font-semibold text-[var(--tone)]">ikinci imza senin</span> : "ikinci imza Risk Sorumlusu’nun"}
    </p>
  );
}
