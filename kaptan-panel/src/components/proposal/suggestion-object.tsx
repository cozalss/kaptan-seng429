"use client";

import { forwardRef, useId, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNow } from "@/lib/clock";
import { fmtInt } from "@/lib/format";
import { href } from "@/lib/nav";
import type { Suggestion, SuggestionAction } from "@/lib/solo/overview";
import { ACTION_WORD, confidenceSentence, confidenceWord, fmtLira } from "@/lib/solo/words";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { answerByLine, shortName } from "@/components/story/plain";
import type { Answer } from "./decide-logic";
import { InkSeal } from "./seal";
import { navigateWithTransition } from "./view-transition";

/** How much and at what price, from the order behind an AL/SAT suggestion. */
export interface OrderFigures {
  amount: number;
  qty: number;
  limit: number;
}

export interface ObjectFacts {
  s: Suggestion;
  name: string | null;
  figures: OrderFigures | null;
  heldAmount: number | null;
}

/** The first thing a person must know before pressing: what the press does, and what it does not. */
const PRESS_SAYS: Readonly<Record<SuggestionAction, string>> = {
  al: "Onaylarsan para çıkmaz: KAPtan sana bankana gireceğin bilgileri verir. Geçersen hiçbir şey olmaz.",
  sat: "Onaylarsan satış olmaz: KAPtan sana bankana gireceğin bilgileri verir. Geçersen hisse elinde kalır.",
  tut: "Onaylarsan hisse elinde kalır, yapman gereken bir şey yok.",
};

export function pressSays(action: SuggestionAction): string {
  return PRESS_SAYS[action];
}

const LEVEL = { Güçlü: 3, Orta: 2, Zayıf: 1 } as const;

/**
 * The suggestion as one physical thing: a huge verb, the company in words, one sentence why, the
 * amount, how sure KAPtan is, by when, "Neden?", Onayla, Geç. Sealing and rollback happen on this
 * same element, so the press lands exactly where the person is looking.
 */
export const SuggestionObject = forwardRef<HTMLHeadingElement, {
  facts: ObjectFacts;
  /** The small line over the object ("Şimdi buna karar ver"). */
  lead: string | null;
  canApprove: boolean;
  canSkip: boolean;
  /** Why the buttons are closed, in plain words. */
  closedReason?: string | null;
  /** Sealed and on its way to the server. */
  sealing: boolean;
  error: string | null;
  /** Only the front object carries the verb across to its "Neden?" page. */
  sharesVerb: boolean;
  onAnswer: (s: Suggestion, answer: Answer) => void;
}>(function SuggestionObject({ facts, lead, canApprove, canSkip, closedReason = null, sealing, error, sharesVerb, onAnswer }, headingRef) {
  const { s, name } = facts;
  const verb = ACTION_WORD[s.action];
  const nowMs = useNow(30_000);
  const titleId = useId();
  const saysId = useId();
  const by = answerByLine(s.expires_at, nowMs);
  const company = name ? shortName(name) : null;

  return (
    <article aria-labelledby={titleId} data-action={s.action} data-state={sealing ? "sealing" : "open"} className={cn("oneri-object oneri-paper", sealing && "oneri-thud")}>
      <header className="oneri-object-top">
        <p className="oneri-object-lead">{sealing ? "Onaylıyorsun…" : closedReason ? "Şimdilik kapalı" : lead}</p>
        <p className="oneri-object-by">{by ?? "Acelesi yok."}</p>
      </header>
      <div className="oneri-object-body">
        <h3 ref={headingRef} id={titleId} tabIndex={-1} className="oneri-object-head">
          <span className={cn("oneri-verb", sharesVerb && "oneri-verb-shared")}>{verb}</span>{" "}
          <span className="oneri-object-who">
            <span className="oneri-object-company">{company ?? s.symbol} hissesi</span>{" "}
            {company ? <span className="oneri-object-symbol">{s.symbol}</span> : null}
          </span>
        </h3>
        <p className="oneri-object-why">{s.reason_short}</p>
      </div>
      <dl className="oneri-object-facts">
        <Amount {...facts} />
        <div className="oneri-object-fact">
          <dt className="u-caption">KAPtan ne kadar emin?</dt>
          <dd className="oneri-object-sure">
            <span aria-hidden className="oneri-sure-marks" data-level={LEVEL[confidenceWord(s.confidence)]}>
              <i />
              <i />
              <i />
            </span>
            {confidenceSentence(s.confidence)}
          </dd>
        </div>
      </dl>
      <div className="oneri-object-end">
        {closedReason ? (
          <p id={saysId} className="oneri-closed">
            {closedReason}
          </p>
        ) : null}
        <div className="oneri-object-actions">
          <Button variant="primary" size="lg" className="oneri-object-approve" disabled={!canApprove} aria-disabled={sealing || undefined} aria-describedby={saysId} aria-label={`Onayla: ${verb} ${s.symbol}`} onClick={() => (sealing ? undefined : onAnswer(s, "approve"))}>
            Onayla
          </Button>
          <Button variant="outline" size="lg" className="oneri-object-skip" disabled={!canSkip} aria-disabled={sealing || undefined} aria-describedby={saysId} aria-label={`Geç: ${verb} ${s.symbol}`} onClick={() => (sealing ? undefined : onAnswer(s, "skip"))}>
            Geç
          </Button>
          {s.action === "tut" ? null : <WhyLink id={s.id} label={`Neden? ${verb} ${s.symbol}`} />}
        </div>
        {closedReason ? null : (
          <p id={saysId} className="oneri-object-says">
            {PRESS_SAYS[s.action]}
          </p>
        )}
      </div>
      {error ? (
        <p role="alert" className="oneri-object-error">
          Olmadı. {error}
        </p>
      ) : null}
      {sealing ? <InkSeal word={s.action === "tut" ? "TAMAM" : "ONAYLADIN"} pressing className="oneri-object-seal" /> : null}
    </article>
  );
});

function Amount({ s, figures, heldAmount }: ObjectFacts) {
  if (s.action === "tut") {
    if (heldAmount === null) return null;
    return (
      <div className="oneri-object-fact">
        <dt className="u-caption">Şu an elinde</dt>
        <dd className="oneri-object-amount">{fmtLira(heldAmount)}</dd>
      </div>
    );
  }
  if (!figures) return null;
  const sell = s.action === "sat";
  return (
    <div className="oneri-object-fact">
      <dt className="u-caption">{sell ? "Bu satışın tutarı" : "Bu alımın tutarı"}</dt>
      <dd className="oneri-object-amount">{fmtLira(figures.amount)}</dd>
      <dd className="oneri-object-detail">
        {fmtInt(figures.qty)} adet, tanesi {sell ? "en az" : "en fazla"} {fmtLira(figures.limit, true)}
      </dd>
    </div>
  );
}

/** "Neden?": a real link, so a new tab and the keyboard work; a plain click also carries the verb across. */
function WhyLink({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const to = href.proposal(id);
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (navigateWithTransition(() => router.push(to))) e.preventDefault();
  };
  return (
    <Link href={to} aria-label={label} onClick={onClick} className="oneri-object-whylink">
      Neden?
      <span aria-hidden> →</span>
    </Link>
  );
}
