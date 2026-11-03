"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { fmtInt } from "@/lib/format";
import type { Suggestion, SuggestionAction } from "@/lib/solo/overview";
import { ACTION_WORD, fmtLira } from "@/lib/solo/words";
import { prefersReducedMotion } from "@/lib/utils";
import { Boat } from "@/components/ufuk/boat";
import { Button } from "@/components/ui/button";
import { OrderSlip } from "@/components/proposal/order-slip";
import { closedFor, LEAVE_MS, sectionSentence, splitDecisions, stepFor, type Flight } from "@/components/proposal/decide-logic";
import { InkSeal, useLanded } from "@/components/proposal/seal";
import { SuggestionObject, type ObjectFacts, type OrderFigures } from "@/components/proposal/suggestion-object";
import type { Decisions } from "@/components/proposal/use-decisions";
import { shortName } from "@/components/story/plain";
import "@/components/proposal/oneri.css";
import "@/components/ufuk/ufuk.css";

export type { OrderFigures };

const ORDER: Readonly<Record<SuggestionAction, number>> = { al: 0, sat: 1, tut: 2 };

/** Buys first, then sells, then holds; the strongest first inside each. */
export function orderSuggestions(list: readonly Suggestion[]): Suggestion[] {
  return [...list].sort((a, b) => ORDER[a.action] - ORDER[b.action] || b.confidence - a.confidence || a.symbol.localeCompare(b.symbol));
}

/** A horizontal drag past this many px on a touch screen shows the next decision. It never answers. */
const SWIPE_PX = 64;

export interface SuggestionsProps {
  suggestions: readonly Suggestion[];
  names: ReadonlyMap<string, string>;
  /** Order figures by suggestion id (AL/SAT). */
  figures?: ReadonlyMap<string, OrderFigures>;
  /** What is held now, by symbol (TUT shows it). */
  held?: ReadonlyMap<string, number>;
  stopped: boolean;
  /** Money fell too far today: no new orders, Geç stays open. */
  halted?: boolean;
  /** Today's reading, for the empty state: how many notices were read and looked at closely. */
  today?: { read: number; toCrew: number } | null;
  decisions: Decisions;
}

/**
 * "What do I do now": orders still to enter at the bank first, then one decision at a time with
 * the rest visibly queued and one press away. Everything is a plain list to a screen reader, and a
 * button to a keyboard; on a phone a swipe also shows the next one.
 */
export function Suggestions({ suggestions, names, figures, held, stopped, halted = false, today = null, decisions }: SuggestionsProps) {
  const { state, steps, onAnswer, onPick } = decisions;
  const { front, queue } = splitDecisions(orderSuggestions(suggestions), state);
  const closed = closedFor({ stopped, halted });
  const open = [front, ...queue].filter((s): s is Suggestion => s !== null);
  const facts = (s: Suggestion): ObjectFacts => ({ s, name: names.get(s.symbol) ?? null, figures: figures?.get(s.id) ?? null, heldAmount: held?.get(s.symbol) ?? null });

  // What a pressed object looked like: the list refreshes under it, the sealed sheet must not change.
  const [pressed, setPressed] = useState<ReadonlyMap<string, ObjectFacts>>(new Map());
  // Where focus goes next: to the object that has just come forward (the button that held it is gone).
  const frontHeading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const frontId = front?.id ?? null;
  const frontError = frontId ? (state.errors[frontId] ?? null) : null;
  useEffect(() => {
    if (!moved.current && !frontError) return;
    moved.current = false;
    frontHeading.current?.focus({ preventScroll: true });
  }, [frontId, frontError]);
  const answer: Decisions["onAnswer"] = (s, a) => {
    setPressed((was) => new Map(was).set(s.id, facts(s)));
    moved.current = a === "skip";
    onAnswer(s, a);
  };
  const pick = (id: string) => {
    moved.current = true;
    onPick(id);
  };

  const leaving = useLeaving(state.flights);
  // One flat, keyed list: a sheet must not remount (and stamp again) when its ticket arrives.
  const answered = [...steps.map((t) => t.proposal_id), ...state.flights.filter((f) => f.answer === "approve" && !steps.some((t) => t.proposal_id === f.id)).map((f) => f.id)];
  const waitingAtBank = steps.filter((t) => t.entry.status === "awaiting").length + state.flights.filter((f) => f.answer === "approve" && f.action !== "tut" && f.phase === "sending" && !steps.some((t) => t.proposal_id === f.id)).length;

  return (
    <section aria-label="Öneriler" className="oneri-section">
      <p role="status" aria-live="polite" className="sr-only">
        {decisions.announcement}
      </p>
      {open.length === 0 && answered.length === 0 ? (
        <div className="oneri-stack-wrap">
          <EmptySuggestions today={today} stopped={stopped} />
          {leaving.map((f) => (
            <LeavingSheet key={f.id} flight={f} />
          ))}
        </div>
      ) : (
        <>
          <h2 className="u-chapter oneri-section-head">{sectionSentence({ decisions: open.length, steps: waitingAtBank, stopped })}</h2>
          {answered.length ? (
            <div className="oneri-steps">
              {answered.map((id) => (
                <AnsweredSlot key={id} id={id} flight={state.flights.find((f) => f.id === id) ?? null} facts={pressed.get(id) ?? null} proposedQty={figures?.get(id)?.qty ?? null} decisions={decisions} />
              ))}
            </div>
          ) : null}
          <div className="oneri-stack-wrap">
            {front ? (
              <SwipeStack data-behind={Math.min(queue.length, 2)} next={() => nextOf(open, frontId, 1, pick)} previous={() => nextOf(open, frontId, -1, pick)}>
                <SuggestionObject key={front.id} ref={frontHeading} facts={facts(front)} lead="Şimdi buna karar ver" canApprove={closed.canApprove} canSkip={closed.canSkip} closedReason={closed.reason} sealing={false} error={frontError} sharesVerb onAnswer={answer} />
              </SwipeStack>
            ) : null}
            {leaving.map((f) => (
              <LeavingSheet key={f.id} flight={f} />
            ))}
          </div>
          {queue.length ? <Queue queue={queue} facts={facts} errors={state.errors} onPick={pick} /> : null}
        </>
      )}
    </section>
  );
}

function nextOf(open: readonly Suggestion[], frontId: string | null, by: 1 | -1, pick: (id: string) => void) {
  const at = open.findIndex((s) => s.id === frontId);
  const next = open[(at + by + open.length) % open.length];
  if (next && next.id !== frontId) pick(next.id);
}

/** The answered object, in the place it was pressed: sealed, then the next step. */
function AnsweredSlot({ id, flight, facts, proposedQty, decisions }: { id: string; flight: Flight | null; facts: ObjectFacts | null; proposedQty: number | null; decisions: Decisions }) {
  const ticket = decisions.ticketOf(id);
  const landed = useLanded(flight !== null);
  const heading = useRef<HTMLHeadingElement>(null);
  // A step from an earlier visit has no flight: it is simply there, quietly.
  const step = flight ? stepFor(flight, { landed, ticket }) : ticket ? ({ kind: "enter", ticket } as const) : ({ kind: "preparing" } as const);
  const sealing = step.kind === "sealing" && facts !== null;
  useEffect(() => {
    if (sealing) heading.current?.focus({ preventScroll: true });
  }, [sealing]);
  if (step.kind === "gone") return null;
  if (sealing) return <SuggestionObject ref={heading} facts={facts} lead={null} canApprove={false} canSkip={false} sealing error={null} sharesVerb={false} onAnswer={() => undefined} />;
  if (step.kind === "line" && flight) {
    return (
      <p className="oneri-line oneri-reveal">
        <strong>{flight.symbol} elinde kalıyor.</strong> Yapman gereken bir şey yok.
      </p>
    );
  }
  if (step.kind === "enter") {
    return <OrderSlip ticket={step.ticket} laid={flight !== null} focusOnMount={flight !== null} proposedQty={facts?.figures?.qty ?? proposedQty} onMarked={decisions.onMarked} />;
  }
  return <Preparing error={decisions.ticketsError} onRetry={decisions.retryTickets} />;
}

/** The approval went through but the order's details have not arrived. The fact is said anyway. */
function Preparing({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="oneri-paper oneri-slip" role="group" aria-label="Bankana gireceğin işlem hazırlanıyor">
      <InkSeal word="ONAYLADIN" className="oneri-slip-seal" />
      <p className="u-chapter oneri-slip-head">Onayladın. İşlem henüz yapılmadı.</p>
      <p className="oneri-slip-body">KAPtan senin yerine işlem yapmaz. Bankana gireceğin bilgiler hazırlanıyor; birazdan burada olur, Param’da da görürsün.</p>
      {error ? (
        <p role="alert" className="oneri-object-error">
          Bilgiler alınamadı. {error}{" "}
          <Button variant="link" onClick={onRetry}>
            Yeniden dene
          </Button>
        </p>
      ) : null}
    </div>
  );
}

/** Geç: the sheet slides quietly away over the next one. It is only a picture: never in the way. */
function useLeaving(flights: readonly Flight[]): Flight[] {
  const [gone, setGone] = useState<readonly string[]>([]);
  const leaving = flights.filter((f) => f.answer === "skip" && !gone.includes(f.id));
  const ids = leaving.map((f) => f.id).join("|");
  useEffect(() => {
    if (!ids) return;
    const list = ids.split("|");
    const timer = setTimeout(() => setGone((prev) => [...prev, ...list]), prefersReducedMotion() ? 0 : LEAVE_MS);
    return () => clearTimeout(timer);
  }, [ids]);
  return leaving;
}

function LeavingSheet({ flight }: { flight: Flight }) {
  return (
    <div aria-hidden className="oneri-paper oneri-leaving" data-action={flight.action}>
      <span className="oneri-verb">{ACTION_WORD[flight.action]}</span>
      <span className="oneri-leaving-word">{flight.symbol} geçildi</span>
    </div>
  );
}

/** A drag follows the finger on the sheet directly (no re-render); letting go past the mark shows the next. */
function SwipeStack({ next, previous, children, ...rest }: { next: () => void; previous: () => void; children: ReactNode; "data-behind": number }) {
  const sheet = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const reset = () => {
    start.current = null;
    if (sheet.current) sheet.current.style.transform = "";
  };
  const onDown = (e: ReactPointerEvent) => {
    if (e.pointerType === "touch" && e.isPrimary && !start.current) start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onMove = (e: ReactPointerEvent) => {
    if (start.current?.id !== e.pointerId || !sheet.current) return;
    sheet.current.style.transform = `translateX(${(e.clientX - start.current.x) * 0.6}px)`;
  };
  const onUp = (e: ReactPointerEvent) => {
    const from = start.current;
    reset();
    if (from?.id !== e.pointerId) return;
    const dx = e.clientX - from.x;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - from.y) * 1.5) (dx < 0 ? next : previous)();
  };
  return (
    <div ref={sheet} className="oneri-stack" {...rest} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={reset}>
      {children}
    </div>
  );
}

function Queue({ queue, facts, errors, onPick }: { queue: readonly Suggestion[]; facts: (s: Suggestion) => ObjectFacts; errors: Readonly<Record<string, string>>; onPick: (id: string) => void }) {
  return (
    <div className="oneri-queue">
      <h3 className="u-caption">Sırada {fmtInt(queue.length)} öneri daha</h3>
      <ol aria-label="Sırada bekleyen öneriler">
        {queue.map((s) => {
          const f = facts(s);
          const verb = ACTION_WORD[s.action];
          const amount = s.action === "tut" ? f.heldAmount : (f.figures?.amount ?? null);
          return (
            <li key={s.id}>
              <button type="button" aria-label={`Öne al: ${verb} ${s.symbol}`} onClick={() => onPick(s.id)} className="oneri-queue-row" data-action={s.action}>
                <span className="oneri-queue-verb">{verb}</span>
                <span className="oneri-queue-who">
                  {f.name ? shortName(f.name) : s.symbol}
                  {errors[s.id] ? <span className="oneri-queue-error"> · olmadı, tekrar bak</span> : null}
                </span>
                {amount !== null ? <span className="oneri-queue-amount">{fmtLira(amount)}</span> : null}
                <span aria-hidden className="oneri-queue-go">
                  →
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Nothing to decide is a good day, and the reading counts show why it is not a broken page. */
function EmptySuggestions({ today, stopped }: { today: { read: number; toCrew: number } | null; stopped: boolean }) {
  return (
    <div className="oneri-empty">
      <div aria-hidden className="oneri-empty-sea">
        <span className="oneri-empty-sun" />
        <Boat className="oneri-empty-boat" />
      </div>
      <h2 className="u-chapter oneri-empty-head">{sectionSentence({ decisions: 0, steps: 0, stopped })}</h2>
      <p className="oneri-empty-body">
        {stopped ? (
          "Sen yeniden başlatana kadar KAPtan yeni öneri çıkarmaz. Elindeki hisseler yerinde duruyor."
        ) : today && today.read > 0 ? (
          <>
            KAPtan bugün <strong>{fmtInt(today.read)}</strong> bildirim okudu, <strong>{fmtInt(today.toCrew)}</strong> tanesine yakından baktı. Şu an senden bir şey beklemiyor.
          </>
        ) : (
          "KAPtan izliyor. Senden şu an bir şey beklemiyor."
        )}
      </p>
      {stopped ? null : <p className="oneri-empty-note">Bir şey çıkarsa burada görürsün; sayfayı yenilemen gerekmez.</p>}
    </div>
  );
}
