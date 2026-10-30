"use client";

import { useState } from "react";
import { fmtTime } from "@/lib/format";
import type { Suggestion, SuggestionAction } from "@/lib/solo/overview";
import { ACTION_WORD, confidenceWord, dayLabel } from "@/lib/solo/words";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type Answer = "approve" | "skip";

const ORDER: Readonly<Record<SuggestionAction, number>> = { al: 0, sat: 1, tut: 2 };

/** Buys first, then sells, then holds; the strongest first inside each. */
export function orderSuggestions(list: readonly Suggestion[]): Suggestion[] {
  return [...list].sort((a, b) => ORDER[a.action] - ORDER[b.action] || b.confidence - a.confidence || a.symbol.localeCompare(b.symbol));
}

/** The verb as a printed stamp: AL indigo, SAT ink, TUT an open box. Words differ, so colour never carries it alone. */
const STAMP: Readonly<Record<SuggestionAction, string>> = {
  al: "solo-stamp-al",
  sat: "solo-stamp-sat",
  tut: "solo-stamp-tut",
};

/** Show this many slips first; a longer list opens with one press (a calm screen, a short phone scroll). */
export const FIRST_SLIPS = 4;

const LEVELS = { Güçlü: 3, Orta: 2, Zayıf: 1 } as const;

function Confidence({ value }: { value: number }) {
  const word = confidenceWord(value);
  return (
    <span className="inline-flex items-center gap-1.5 text-dense text-ink-soft">
      <span aria-hidden className="flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn("h-2.5 w-1.5", i <= LEVELS[word] ? "bg-ink" : "bg-hairline")} />
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
  stopped: boolean;
  busy: { id: string; answer: Answer } | null;
  errors: Readonly<Record<string, string>>;
  onAnswer: (s: Suggestion, answer: Answer) => void;
}

/**
 * "Öneriler": one slip per suggestion — the verb stamped large, the share, one plain sentence
 * why, how sure KAPtan is, until when, and two buttons: Onayla / Geç.
 */
export function Suggestions({ suggestions, names, stopped, busy, errors, onAnswer }: SuggestionsProps) {
  const list = orderSuggestions(suggestions);
  const [showAll, setShowAll] = useState(false);
  const folded = !showAll && list.length > FIRST_SLIPS + 1;
  const shown = folded ? list.slice(0, FIRST_SLIPS) : list;
  return (
    <section aria-labelledby="oneriler" className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="oneriler" className="font-display text-display tracking-[-0.01em] text-ink">
          Öneriler
        </h2>
        <span className="text-dense text-muted tabular-nums">{list.length > 0 ? `${list.length} öneri bekliyor` : null}</span>
      </div>
      {stopped ? (
        <p className="mt-2 text-ui text-ink-soft">İşlemler durduruldu; öneriler şimdilik onaylanamaz.</p>
      ) : null}
      {list.length === 0 ? (
        <p className="mt-4 border-2 border-ink bg-panel px-5 py-6 text-ui text-ink-soft">
          Şu an yeni öneri yok. KAPtan bir fırsat ya da yapılacak bir iş gördüğünde burada çıkar.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {shown.map((s) => (
            <SuggestionSlip
              key={s.id}
              s={s}
              name={names.get(s.symbol) ?? null}
              stopped={stopped}
              busy={busy?.id === s.id ? busy.answer : null}
              locked={busy !== null && busy.id !== s.id}
              error={errors[s.id] ?? null}
              onAnswer={onAnswer}
            />
          ))}
        </ul>
      )}
      {folded ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center border-2 border-ink bg-panel px-4 text-ui font-medium text-ink transition-colors duration-[var(--dur-quick)] hover:bg-wash-tint"
        >
          {list.length - FIRST_SLIPS} öneri daha göster
        </button>
      ) : null}
    </section>
  );
}

function SuggestionSlip({
  s,
  name,
  stopped,
  busy,
  locked,
  error,
  onAnswer,
}: {
  s: Suggestion;
  name: string | null;
  stopped: boolean;
  busy: Answer | null;
  locked: boolean;
  error: string | null;
  onAnswer: (s: Suggestion, answer: Answer) => void;
}) {
  const verb = ACTION_WORD[s.action];
  const titleId = `oneri-${s.id}`;
  const closed = stopped || busy !== null || locked;
  return (
    <li aria-labelledby={titleId} className="animate-card-arrive flex border-2 border-ink bg-panel shadow-ink">
      <div aria-hidden className={cn("flex w-16 shrink-0 items-center justify-center border-r-2 sm:w-[104px]", STAMP[s.action])}>
        <span className="title-display text-[28px] sm:text-[44px]">{verb}</span>
      </div>
      <div className="min-w-0 flex-1 px-4 py-3.5 sm:px-5 sm:py-4">
        <h3 id={titleId} className="flex flex-wrap items-baseline gap-x-2 text-[18px] leading-7 font-semibold text-ink">
          <span>
            {verb} — {s.symbol}
          </span>
          {name ? <span className="text-dense font-normal text-muted">{name}</span> : null}
        </h3>
        <p className="mt-1 text-body text-ink-soft">{s.reason_short}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Confidence value={s.confidence} />
          {s.expires_at ? (
            <span className="text-dense text-muted tabular-nums">
              Son onay: {dayLabel(s.expires_at)} {fmtTime(s.expires_at)}
            </span>
          ) : null}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="md"
            disabled={closed}
            pending={busy === "approve"}
            onClick={() => onAnswer(s, "approve")}
            aria-label={`Onayla: ${verb} ${s.symbol}`}
            className="min-w-28 max-sm:h-11"
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
            className="min-w-20 max-sm:h-11"
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
    </li>
  );
}
