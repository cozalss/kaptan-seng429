"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { navigateWithTransition } from "@/components/proposal/view-transition";
import { fmtSignedFigurePct, fmtTime } from "@/lib/format";
import { href } from "@/lib/nav";
import { dayLabel, titleTr } from "@/lib/solo/words";
import { shortName } from "@/components/story/plain";
import { Boat } from "@/components/ufuk/boat";
import { ratioScale, STATE_WORD, type SuggestedRow } from "./suggested-words";
import { useListMotion } from "@/components/ui/use-list-motion";

/** The rows of "Öneriye düşenler": each opens its proposal. Shared by the home block and /oneriler. */
export function SuggestedList({ rows, label }: { rows: readonly SuggestedRow[]; label: string }) {
  const scale = ratioScale(rows);
  const motion = useListMotion<HTMLUListElement>();
  return (
    <ul ref={motion} className="hm-sg-list" aria-label={label}>
      {rows.map((r) => (
        <li key={r.id}>
          <SuggestedItem row={r} scale={scale} />
        </li>
      ))}
    </ul>
  );
}

function SuggestedItem({ row: r, scale }: { row: SuggestedRow; scale: number }) {
  const router = useRouter();
  const to = href.proposal(r.id);
  // A plain click carries the row's AL/SAT across into the proposal's big verb; a new tab or the keyboard's
  // modifiers keep the ordinary link.
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const verb = e.currentTarget.querySelector<HTMLElement>(".hm-sg-verb");
    if (navigateWithTransition(() => router.push(to), verb)) e.preventDefault();
  };
  return (
    <Link href={to} onClick={onClick} className="hm-sg-row" data-state={r.state}>
      <span className="hm-sg-when">
        <span className="hm-sg-day">{dayLabel(r.at)}</span>
        <span className="hm-sg-time">{fmtTime(r.at)}</span>
      </span>
      <span className="hm-sg-body">
        <span className="hm-sg-who">
          <strong>{r.ticker}</strong> {titleTr(shortName(r.company))}
        </span>
        <span className="hm-sg-line">{r.line}</span>
        <span className="hm-sg-said">
          <span className="hm-sg-verb" data-action={r.verb}>
            {r.verb === "al" ? "AL" : "SAT"}
          </span>{" "}
          {r.why}
        </span>
      </span>
      <span className="hm-sg-end">
        <span className="hm-sg-state">{STATE_WORD[r.state]}</span>
        <Result row={r} scale={scale} />
      </span>
    </Link>
  );
}

function Result({ row: r, scale }: { row: SuggestedRow; scale: number }) {
  if (r.ratio === null) return r.pending ? <span className="hm-sg-wait">{r.pending}</span> : null;
  const sign = r.ratio > 0 ? "up" : r.ratio < 0 ? "down" : "flat";
  const width = scale === 0 ? 0 : (Math.abs(r.ratio) / scale) * 50;
  return (
    <span className="hm-sg-result">
      <span className="hm-track-pct" data-sign={sign}>
        {sign === "up" ? "▲ " : sign === "down" ? "▼ " : ""}
        {fmtSignedFigurePct(r.ratio)}
        {r.ifFollowed ? <span className="hm-track-if"> uysaydın</span> : null}
      </span>
      <span aria-hidden className="hm-track-bar">
        {sign !== "flat" ? <span className="hm-track-fill" data-sign={sign} style={{ width: `${width}%` }} /> : null}
      </span>
    </span>
  );
}

/** Nothing reached a suggestion yet: the boat at rest on a calm line, and the plain reason beside it. */
export function SuggestedEmpty({ reason }: { reason: string }) {
  return (
    <div className="hm-sg-empty">
      <div aria-hidden className="hm-sg-art">
        <Boat className="hm-sg-boat" />
        <svg viewBox="0 0 192 24" className="hm-sg-water" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" focusable="false">
          <path d="M4 6h184" strokeWidth="2" />
          <path d="M28 14h40M96 14h56M48 21h28M124 21h24" opacity="0.5" />
        </svg>
      </div>
      <p className="hm-quiet">{reason}</p>
    </div>
  );
}
