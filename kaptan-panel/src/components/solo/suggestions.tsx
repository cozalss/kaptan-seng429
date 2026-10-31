"use client";

import { useState } from "react";
import { fmtInt, fmtTime } from "@/lib/format";
import type { Suggestion, SuggestionAction } from "@/lib/solo/overview";
import { ACTION_WORD, confidenceWord, dayLabel, fmtLira } from "@/lib/solo/words";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type Answer = "approve" | "skip";

const ORDER: Readonly<Record<SuggestionAction, number>> = { al: 0, sat: 1, tut: 2 };

/** Buys first, then sells, then holds; the strongest first inside each. */
export function orderSuggestions(list: readonly Suggestion[]): Suggestion[] {
  return [...list].sort((a, b) => ORDER[a.action] - ORDER[b.action] || b.confidence - a.confidence || a.symbol.localeCompare(b.symbol));
}

/** Show this many first; the rest open from the section header (a calm screen, a short phone scroll). */
export const FIRST_SLIPS = 3;

/** How much and at what price, from the order behind an AL/SAT suggestion (the desk's own numbers). */
export interface OrderFigures {
  amount: number;
  qty: number;
  limit: number;
}

/** What this person may press here (single-user: everything; a team desk: the role's rights). */
export interface DecideRights {
  decide: boolean;
  decideWhy: string | null;
  /** Under an AL/SAT card on a team desk: who gives the second signature. */
  signLine: string | null;
}

const ALL_RIGHTS: DecideRights = { decide: true, decideWhy: null, signLine: null };

/** The verb as a small pill: AL green, SAT claret, TUT neutral. The word always carries it. */
const BADGE: Readonly<Record<SuggestionAction, string>> = {
  al: "bg-gain text-on-dark",
  sat: "bg-loss text-on-dark",
  tut: "bg-sunk text-ink ring-1 ring-line-strong",
};
const AVATAR: Readonly<Record<SuggestionAction, string>> = {
  al: "bg-gain/10 text-gain",
  sat: "bg-loss/10 text-loss",
  tut: "bg-sunk text-ink-soft",
};

const LEVELS = { Güçlü: 3, Orta: 2, Zayıf: 1 } as const;

function Confidence({ value }: { value: number }) {
  const word = confidenceWord(value);
  return (
    <span className="inline-flex items-center gap-2 text-dense text-muted">
      <span aria-hidden className="flex items-end gap-[2px]">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn("w-1 rounded-full", i === 1 ? "h-2" : i === 2 ? "h-2.5" : "h-3", i <= LEVELS[word] ? "bg-brand" : "bg-line-strong")} />
        ))}
      </span>
      <span>
        Güven: <span className="font-semibold text-ink">{word}</span>
      </span>
    </span>
  );
}

export interface SuggestionsProps {
  suggestions: readonly Suggestion[];
  names: ReadonlyMap<string, string>;
  /** Order figures by suggestion id (AL/SAT). */
  figures?: ReadonlyMap<string, OrderFigures>;
  /** What is held now, by symbol (TUT cards show it). */
  held?: ReadonlyMap<string, number>;
  stopped: boolean;
  busy: { id: string; answer: Answer } | null;
  errors: Readonly<Record<string, string>>;
  rights?: DecideRights;
  /** Today's reading, for the empty state: how many notices were read and sent to the crew. */
  today?: { read: number; toCrew: number } | null;
  onAnswer: (s: Suggestion, answer: Answer) => void;
}

/**
 * "Öneriler": one card with a row per suggestion — the company, the verb (AL / SAT / TUT), how
 * much and at what price, one plain sentence why, how sure KAPtan is, until when, and two
 * buttons: Onayla / Geç. On a team desk each AL/SAT row also says who signs second.
 */
export function Suggestions({ suggestions, names, figures, held, stopped, busy, errors, rights = ALL_RIGHTS, today = null, onAnswer }: SuggestionsProps) {
  const list = orderSuggestions(suggestions);
  const [showAll, setShowAll] = useState(false);
  const foldable = list.length > FIRST_SLIPS;
  const shown = foldable && !showAll ? list.slice(0, FIRST_SLIPS) : list;
  return (
    <section aria-labelledby="oneriler" className="min-w-0 overflow-clip rounded-2xl border border-line bg-panel shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <h2 id="oneriler" className="text-title font-semibold tracking-[-0.01em] text-ink">
            Öneriler
          </h2>
          {list.length > 0 ? (
            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-meta leading-none font-semibold text-on-dark tabular-nums">
              {list.length}
              <span className="sr-only"> öneri bekliyor</span>
            </span>
          ) : null}
        </div>
        {foldable ? (
          <button
            type="button"
            aria-expanded={showAll}
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex min-h-11 items-center gap-1 text-dense font-semibold text-brand hover:underline hover:underline-offset-4 sm:min-h-9"
          >
            {showAll ? "Daha az göster" : `Tümünü gör (${list.length})`}
          </button>
        ) : null}
        {stopped ? <p className="w-full text-dense text-ink-soft">İşlemler durduruldu; öneriler şimdilik onaylanamaz.</p> : null}
        {!stopped && !rights.decide && rights.decideWhy && list.length > 0 ? <p className="w-full text-dense text-ink-soft">{rights.decideWhy}</p> : null}
      </header>
      {list.length === 0 ? (
        <EmptySuggestions today={today} />
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((s) => (
            <SuggestionRow
              key={s.id}
              s={s}
              name={names.get(s.symbol) ?? null}
              figures={figures?.get(s.id) ?? null}
              heldAmount={held?.get(s.symbol) ?? null}
              stopped={stopped}
              busy={busy?.id === s.id ? busy.answer : null}
              locked={busy !== null && busy.id !== s.id}
              error={errors[s.id] ?? null}
              rights={rights}
              onAnswer={onAnswer}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptySuggestions({ today }: { today: { read: number; toCrew: number } | null }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span aria-hidden className="grid size-12 place-items-center rounded-full bg-sunk text-brand">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 5.5l1.6 6.5h-3.2z" fill="currentColor" />
          <path d="M10.4 12 12 18.5 13.6 12" />
        </svg>
      </span>
      <p className="mt-3 text-body font-semibold text-ink">Şu an yeni öneri yok — KAPtan izliyor.</p>
      {today ? (
        <dl className="mt-4 grid w-full max-w-[360px] grid-cols-2 divide-x divide-line rounded-xl border border-line bg-paper/60 py-3">
          <div className="px-3">
            <dt className="text-meta text-muted">bugün okunan bildirim</dt>
            <dd className="text-[22px] leading-8 font-semibold text-ink tabular-nums">{fmtInt(today.read)}</dd>
          </div>
          <div className="px-3">
            <dt className="text-meta text-muted">yakından incelenen</dt>
            <dd className="text-[22px] leading-8 font-semibold text-ink tabular-nums">{fmtInt(today.toCrew)}</dd>
          </div>
        </dl>
      ) : null}
      <p className="mt-1 max-w-[44ch] text-dense text-ink-soft">Bir fırsat ya da yapılacak bir iş gördüğünde burada çıkar; sayfayı yenilemen gerekmez.</p>
    </div>
  );
}

interface RowProps {
  s: Suggestion;
  name: string | null;
  figures: OrderFigures | null;
  heldAmount: number | null;
  stopped: boolean;
  busy: Answer | null;
  locked: boolean;
  error: string | null;
  rights: DecideRights;
  onAnswer: (s: Suggestion, answer: Answer) => void;
}

function SuggestionRow({ s, name, figures, heldAmount, stopped, busy, locked, error, rights, onAnswer }: RowProps) {
  const verb = ACTION_WORD[s.action];
  const titleId = `oneri-${s.id}`;
  const closed = stopped || busy !== null || locked || !rights.decide;
  return (
    <li aria-labelledby={titleId} className="animate-card-arrive px-5 py-4 transition-colors duration-[var(--dur-quick)] hover:bg-wash-tint/40 sm:px-6 sm:py-5">
      <div className="flex gap-3.5">
        <span aria-hidden className={cn("mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-semibold tracking-tight", AVATAR[s.action])}>
          {s.symbol.slice(0, 5)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-x-4 gap-y-1 sm:flex-row sm:items-start sm:justify-between">
            <h3 id={titleId} aria-label={`${verb} — ${s.symbol}${name ? ` ${name}` : ""}`} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-body font-semibold text-ink">{s.symbol}</span>
              <span aria-hidden className={cn("rounded-full px-2 text-[12px] leading-5 font-bold tracking-[0.04em]", BADGE[s.action])}>
                {verb}
              </span>
              {name ? <span className="w-full truncate text-dense font-normal text-muted sm:w-auto">{name}</span> : null}
            </h3>
            <Figures action={s.action} figures={figures} heldAmount={heldAmount} />
          </div>
          <p className="mt-1.5 text-ui text-ink-soft">{s.reason_short}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Confidence value={s.confidence} />
            {s.expires_at ? (
              <span className="text-dense text-muted tabular-nums">
                Son onay: {dayLabel(s.expires_at)} {fmtTime(s.expires_at)}
              </span>
            ) : null}
          </p>
          {rights.signLine && s.action !== "tut" ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sunk px-2.5 py-0.5 text-meta text-ink-soft">
              <span className="font-semibold text-ink tabular-nums">İmza 1/2</span>
              <span aria-hidden>·</span>
              {rights.signLine}
            </p>
          ) : null}
          <div className="mt-3.5 grid grid-cols-2 gap-2 sm:flex">
            <Button
              variant="primary"
              size="md"
              disabled={closed}
              pending={busy === "approve"}
              onClick={() => onAnswer(s, "approve")}
              aria-label={`Onayla: ${verb} ${s.symbol}`}
              className="max-sm:h-11 sm:min-w-28"
            >
              {busy === "approve" ? "Onaylanıyor…" : "Onayla"}
            </Button>
            <Button
              variant="outline"
              size="md"
              disabled={closed}
              pending={busy === "skip"}
              onClick={() => onAnswer(s, "skip")}
              aria-label={`Geç: ${verb} ${s.symbol}`}
              className="max-sm:h-11 sm:min-w-20"
            >
              {busy === "skip" ? "Geçiliyor…" : "Geç"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="mt-2 text-dense font-medium text-north">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function Figures({ action, figures, heldAmount }: { action: SuggestionAction; figures: OrderFigures | null; heldAmount: number | null }) {
  if (action === "tut") {
    if (heldAmount === null) return null;
    return (
      <p className="shrink-0 tabular-nums sm:text-right">
        <span className="block text-[18px] leading-7 font-semibold text-ink">{fmtLira(heldAmount)}</span>
        <span className="block text-meta text-muted">şu an elinde</span>
      </p>
    );
  }
  if (!figures) return null;
  return (
    <p className="shrink-0 tabular-nums sm:text-right">
      <span className="block text-[18px] leading-7 font-semibold text-ink">{fmtLira(figures.amount)}</span>
      <span className="block text-meta text-muted">
        {fmtInt(figures.qty)} lot · {action === "sat" ? "en az" : "en fazla"} {fmtLira(figures.limit, true)}
      </span>
    </p>
  );
}
