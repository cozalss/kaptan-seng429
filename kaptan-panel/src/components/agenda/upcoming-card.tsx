"use client";

import "./agenda.css";

import Link from "next/link";
import { soon } from "@/lib/agenda/agenda";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { ROUTES } from "@/lib/nav";
import { istanbulDay } from "@/lib/session-day";
import { EventRow } from "./event-row";

const HORIZON_DAYS = 14;
const SHOWN = 4;

/** "Önümüzdeki 2 hafta": the next dates for what you hold and watch. Quiet when nothing is known. */
export function UpcomingCard() {
  const q = useApiQuery((api) => api.calendar(HORIZON_DAYS), []);
  const now = useNow(60_000);
  if (!q.data || now === null) return null;
  const today = istanbulDay(now);
  const next = soon(q.data, today, HORIZON_DAYS, SHOWN);
  return (
    <section aria-labelledby="yaklasan" className="ag-card">
      <h2 id="yaklasan" className="u-caption">
        Önümüzdeki 2 hafta
      </h2>
      {next.length === 0 ? (
        <p className="text-body text-ink-soft">Yakında bilinen bir şey yok.</p>
      ) : (
        <ul className="ag-list">
          {next.map((e) => (
            <EventRow key={e.id} event={e} today={today} />
          ))}
        </ul>
      )}
      <Link href={ROUTES.takvim} className="ag-link">
        Takvimin tamamı →
      </Link>
    </section>
  );
}
