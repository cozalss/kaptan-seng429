"use client";

import "./signal.css";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TickerLink } from "@/components/company/ticker-link";
import { useReadingMarks } from "@/components/reading/marks";
import { NewMark } from "@/components/reading/save-star";
import { fmtTime } from "@/lib/format";
import type { SignalItem, SignalTone } from "@/lib/domain/signal";
import { moveFocus, swipeState, TONE_LABEL, TRIAGE_LABEL, TRIAGE_ORDER, triageForKey } from "@/lib/signal/signal";

const TONE_MARK: Readonly<Record<SignalTone, string>> = { olumlu: "▲", olumsuz: "▼", notr: "●", belirsiz: "?" };

/** The tone as a word and a mark (never colour alone). */
export function ToneChip({ tone }: { tone: SignalTone }) {
  return (
    <span className={`sg-tone sg-tone--${tone}`}>
      <span aria-hidden>{TONE_MARK[tone]}</span>
      {TONE_LABEL[tone]}
    </span>
  );
}

/** Yapılacak / Sonra oku / Tamam for one disclosure: three toggles; the same one again takes it back. */
export function TriageButtons({ index, label }: { index: number; label: string }) {
  const marks = useReadingMarks();
  if (!marks) return null;
  const current = marks.triageOf(index);
  return (
    <div className="sg-triage" role="group" aria-label={`${label}: ne yapacaksın?`}>
      {TRIAGE_ORDER.map((s) => (
        <button key={s} type="button" className="sg-tri" aria-pressed={current === s} onClick={() => void marks.setTriage(index, s)}>
          {TRIAGE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

/**
 * One important disclosure: who, one plain line, its tone, what it means for you, KAPtan's word on it, three
 * triage states and the way into the reading drawer. A swipe on a phone sets a state (right: Tamam, left:
 * Sonra oku); on a desktop the list keys do (see `useSignalKeys`).
 */
export function SignalRow({ item, focused = false, showTime = true, children }: { item: SignalItem; focused?: boolean; showTime?: boolean; children?: ReactNode }) {
  const marks = useReadingMarks();
  const start = useRef<{ x: number; y: number } | null>(null);
  const label = item.ticker ?? item.company_name;
  return (
    <li
      className="sg-row"
      data-signal-index={item.disclosure_index}
      data-focused={focused}
      onTouchStart={(e) => {
        const t = e.touches[0];
        start.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0];
        const from = start.current;
        start.current = null;
        if (!t || !from || !marks) return;
        const next = swipeState(t.clientX - from.x, t.clientY - from.y);
        if (next) void marks.setTriage(item.disclosure_index, next);
      }}
    >
      <p className="sg-who">
        {item.ticker ? <TickerLink ticker={item.ticker} className="font-bold" /> : null}
        <span className="sg-company">{item.company_name}</span>
        <NewMark index={item.disclosure_index} />
        {item.mine ? <span className="sg-mine">{item.mine === "held" ? "Elinde var" : "İzliyorsun"}</span> : null}
        {showTime ? <time dateTime={item.published_at} className="sg-company tabular-nums">{fmtTime(item.published_at)}</time> : null}
      </p>
      <p className="sg-line">{item.line_tr}</p>
      <p className="sg-meta">
        <ToneChip tone={item.tone} />
        {item.suggestion_tr ? <span className="sg-suggest">{item.suggestion_tr}</span> : null}
      </p>
      {item.so_what_tr ? <p className="sg-sowhat">{item.so_what_tr}</p> : null}
      {children}
      <div className="sg-meta">
        <Link href={item.panel_path} className="sg-open" aria-label={`${label}: duyuruyu aç`}>
          Duyuruyu aç →
        </Link>
        <TriageButtons index={item.disclosure_index} label={label} />
      </div>
    </li>
  );
}

/**
 * Keyboard for a list of important disclosures (desktop): j / k move, a / s / d set Yapılacak / Sonra oku /
 * Tamam, Enter opens. Ignored while typing in a field or when a dialog is open. Returns the focused index.
 */
export function useSignalKeys(ids: readonly number[], onOpen: (index: number) => void): number | null {
  const marks = useReadingMarks();
  const [at, setAt] = useState(-1);
  const state = useRef({ ids, at, marks, onOpen });
  useEffect(() => {
    state.current = { ids, at, marks, onOpen };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      const s = state.current;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "j" || e.key === "k") {
        const next = moveFocus(s.at, s.ids.length, e.key);
        setAt(next);
        const id = s.ids[next];
        document.querySelector(`[data-signal-index="${id}"]`)?.scrollIntoView({ block: "nearest" });
        e.preventDefault();
        return;
      }
      const id = s.ids[s.at];
      if (id === undefined) return;
      if (e.key === "Enter" && !el?.closest("a,button")) {
        s.onOpen(id);
        return;
      }
      const triage = triageForKey(e);
      if (triage) {
        void s.marks?.setTriage(id, triage);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return at >= 0 ? (ids[at] ?? null) : null;
}
