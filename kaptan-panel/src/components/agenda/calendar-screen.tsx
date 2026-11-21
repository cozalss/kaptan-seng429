"use client";

import "./agenda.css";

import { useState } from "react";
import { dayLabel, groupByDay } from "@/lib/agenda/agenda";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { istanbulDay } from "@/lib/session-day";
import { PageHeader, ScreenState } from "@/components/shell/page-frame";
import { EventRow } from "./event-row";

const RANGES = [14, 30, 60, 120] as const;

function sentence(n: number | null): string {
  if (n === null) return "Takvimi hazırlıyorum…";
  return n === 0 ? "Yakında bilinen bir şey yok." : `Önünde ${n} tarih var.`;
}

/**
 * /takvim: dates ahead for the shares you hold and watch, each read from a real source (a company's own
 * KAP notice, last year's report day, the central bank's calendar). What could not be read is said, not guessed.
 */
export function CalendarScreen() {
  const [days, setDays] = useState<number>(60);
  const q = useApiQuery((api) => api.calendar(days), [days]);
  const now = useNow(60_000);
  const today = now === null ? null : istanbulDay(now);
  const cal = q.data ?? null;
  return (
    <div>
      <PageHeader
        name="Takvim"
        title={sentence(cal ? cal.events.length : q.error ? 0 : null)}
        lead="Elinde olan ve izlediğin hisselerin yaklaşan günleri; bir de Merkez Bankası'nın faiz kararı günleri. Her tarih bir kaynaktan okunur, kaynağı yanında yazar."
        actions={
          <div className="ag-days" role="group" aria-label="Kaç gün ilerisi">
            {RANGES.map((n) => (
              <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)}>
                {n} gün
              </button>
            ))}
          </div>
        }
      />
      {q.error && !cal ? (
        <ScreenState kind="error" title="Takvimi şu an açamadım." onRetry={q.refetch}>
          {q.error}
        </ScreenState>
      ) : null}
      {cal && today ? (
        <>
          {groupByDay(cal.events).map((g) => (
            <section key={g.day} aria-label={dayLabel(g.day, today)} className="ag-day">
              <ul className="ag-list">
                {g.events.map((e) => (
                  <EventRow key={e.id} event={e} today={today} />
                ))}
              </ul>
            </section>
          ))}
          <div className="ag-notes">
            {cal.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
