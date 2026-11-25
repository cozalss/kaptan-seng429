"use client";

import type { ReactNode } from "react";
import { useNow } from "@/lib/clock";
import { dayLabel, istanbulDay } from "@/lib/session-day";
import { greeting, marketOpen } from "@/lib/solo/greeting";
import type { TodayWords } from "./today-words";

/**
 * The single "today" header: greeting, date and whether the market is open, then the one sentence that
 * answers "is anything happening with my stocks, must I decide?", a quieter sentence under it and, when
 * there is one, the morning brief behind a press.
 */
export function TodayHeader({ name, words, brief }: { name: string | null; words: TodayWords; brief?: ReactNode }) {
  const now = useNow(60_000);
  const open = now !== null && marketOpen(now);
  return (
    <header className="hm-today">
      <p className="hm-today-day">
        {now === null ? (
          " "
        ) : (
          <>
            <span>
              {greeting(now)}
              {name ? <>, <span className="hm-today-name">{name}</span></> : null}.
            </span>
            <span className="hm-today-date">{dayLabel(istanbulDay(now))}</span>
            <span className="hm-today-market" data-open={open}>
              <span aria-hidden className="hm-today-dot" />
              {open ? "Borsa açık" : "Borsa kapalı"}
            </span>
          </>
        )}
      </p>
      <h1 className="hm-today-head" tabIndex={-1} data-route-focus="">
        {words.headline}
      </h1>
      {words.detail ? <p className="hm-today-detail">{words.detail}</p> : null}
      {brief}
    </header>
  );
}
