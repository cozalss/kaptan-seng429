"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import type { ApprovalCard } from "@/lib/domain";
import { ROUTES } from "@/lib/nav";
import { prefersReducedMotion } from "@/lib/utils";
import { plainEvent, proposalLine, shortName } from "@/components/story/plain";
import { titleTr } from "@/components/story/turkish";
import { BigSentence, Kicker } from "@/components/story/ui";

/** Keeps a range such as "5–10" on one line. */
const WORD_JOINER = String.fromCharCode(0x2060);

/** Scroll to the decision (#karar) and put the keyboard there too. */
function goToDecision(e: MouseEvent<HTMLAnchorElement>) {
  const target = document.getElementById("karar");
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  if (target.hasAttribute("tabindex")) target.focus({ preventScroll: true });
}

/**
 * The top of an Öneri: back to Bugün, whose news it is (the company in words, the ticker as a
 * quiet code), what happened in one big sentence, and the proposal itself in one plain line,
 * with a way straight down to the decision.
 */
export function ProposalHeader({ card }: { card: ApprovalCard }) {
  return (
    <header className="space-y-5">
      <Link href={ROUTES.bugun} className="group inline-flex min-h-11 items-center gap-1.5 text-dense text-muted hover:text-ink sm:min-h-0">
        <span aria-hidden className="transition-transform duration-[var(--dur-quick)] group-hover:-translate-x-0.5">
          ←
        </span>
        Bugün
      </Link>
      <Kicker className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-ui font-medium tracking-normal text-ink">{titleTr(shortName(card.company_name))}</span>
        <span>
          Borsa kodu <span className="code">{card.ticker}</span>
        </span>
      </Kicker>
      <BigSentence id="oneri-baslik" focusTarget>
        {plainEvent(card)}
      </BigSentence>
      {/* The ask in one plain line, ruled off like the head of a form, with the way down to the decision. */}
      <div className="flex flex-col gap-3 border-y-2 border-ink py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        {/* An Inter line: its figures are already tabular, so no <Num> (that is for Bodoni lines). */}
        <p className="max-w-[560px] text-body text-pretty text-ink tabular-nums">{proposalLine(card).replace(/(\d)–(\d)/g, `$1${WORD_JOINER}–${WORD_JOINER}$2`)}</p>
        <a
          href="#karar"
          onClick={goToDecision}
          className="group inline-flex min-h-11 shrink-0 items-center gap-2 self-start border-2 border-ink bg-panel px-4 text-ui font-medium text-ink transition-colors duration-[var(--dur-quick)] hover:bg-wash-tint active:bg-wash-tint-strong sm:self-auto"
        >
          Karara git
          <span aria-hidden className="inline-block transition-transform duration-[var(--dur-quick)] ease-[var(--ease-out-expo)] group-hover:translate-y-0.5">
            ↓
          </span>
        </a>
      </div>
    </header>
  );
}
