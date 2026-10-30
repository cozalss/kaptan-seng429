"use client";

import { useMemo, useState } from "react";
import { MAX_DISCLOSURES } from "@/lib/api/limits";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { fmtInt } from "@/lib/format";
import { dayLabel, istanbulDay, sessionView } from "@/lib/session-day";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { nextTradingDay, prevTradingDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CARD } from "@/components/portfolio/kit";
import { PageHeader } from "@/components/shell/page-frame";
import { useDesk } from "@/components/shell/desk-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ErrorState, SkeletonLines } from "@/components/ui/primitives";
import { FATE_LABEL, fateOf, tickerOf, type DisclosureFate } from "./disclosure-logic";
import { DisclosureRows } from "./disclosure-rows";

type Filter = "all" | DisclosureFate;
/** Rows at first; "Daha fazla göster" adds as many again. */
const PAGE = 50;
const FILTERS: readonly Filter[] = ["all", "processed", "archived", "noise"];

/**
 * /bildirimler — one session's KAP disclosures with what the desk did with each. Opens on the
 * day Bugün talks about (the last session on a weekend); step back and forth by session,
 * narrow by ticker or company, or by what happened.
 */
export function DisclosuresScreen() {
  const now = useNow(60_000);
  const { counters } = useDesk();
  const [picked, setPicked] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE);
  const session = now === null ? null : sessionView(now, counters?.total ?? null);
  const day = picked ?? session?.shown ?? null;
  const today = now === null ? null : istanbulDay(now);

  const q = useApiQuery((api) => (day ? api.disclosures({ day, limit: MAX_DISCLOSURES }) : Promise.resolve(null)), [day]);
  // The day's exact total (the list stops at MAX_DISCLOSURES): GET /disclosures/counters?day=.
  const exact = useApiQuery((api) => (day ? api.counters(day) : Promise.resolve(null)), [day]);
  useEventStream("feed", {
    counters: () => {
      if (day !== today) return;
      void q.refetch();
      void exact.refetch();
    },
  });

  const rows = useMemo(() => {
    const all = q.data ?? [];
    const needle = search.trim().toLocaleUpperCase("tr-TR");
    return all.filter(
      (d) =>
        (filter === "all" || fateOf(d) === filter) &&
        (!needle || (tickerOf(d) ?? "").includes(needle) || d.company_name.toLocaleUpperCase("tr-TR").includes(needle)),
    );
  }, [q.data, search, filter]);
  const count = (f: Filter) => (q.data ?? []).filter((d) => f === "all" || fateOf(d) === f).length;
  const capped = (q.data?.length ?? 0) >= MAX_DISCLOSURES;

  return (
    <div>
      <PageHeader
        title="Bildirimler"
        lead={day ? `${dayLabel(day)}${day === today ? " · bugün" : ""} · KAP’ta yayımlananlar ve tayfanın ne yaptığı` : "KAP’ta yayımlananlar ve tayfanın ne yaptığı"}
        actions={
          day && today ? (
            <div role="group" aria-label="Seans seç" className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setPicked(prevTradingDay(day));
                  setShown(PAGE);
                }}
              >
                ← Önceki seans
              </Button>
              <Button size="sm" disabled={day >= today} onClick={() => {
                  setPicked(nextTradingDay(day) > today ? today : nextTradingDay(day));
                  setShown(PAGE);
                }}
              >
                Sonraki seans →
              </Button>
            </div>
          ) : null
        }
      />

      <section aria-labelledby="bildirim-listesi" className={cn(CARD, "overflow-hidden")}>
        <div className="flex flex-col gap-3 px-5 pt-4 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 id="bildirim-listesi" className="text-body font-semibold text-ink">
            {exact.data && q.data ? `${fmtInt(Math.max(exact.data.total, q.data.length))} bildirim` : q.data ? `${fmtInt(q.data.length)}${capped ? "+" : ""} bildirim` : "Bildirimler"}
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div role="group" aria-label="Ne oldu" className="inline-flex flex-wrap gap-1 self-start rounded-xl bg-sunk p-1">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => {
                    setFilter(f);
                    setShown(PAGE);
                  }}
                  className={cn(
                    "h-9 rounded-lg px-3 text-dense font-medium transition-colors duration-[var(--dur-quick)] max-sm:h-10",
                    filter === f ? "bg-panel text-ink shadow-[0_1px_3px_rgb(16_17_23/0.18)]" : "text-ink-soft hover:text-ink",
                  )}
                >
                  {f === "all" ? "Tümü" : FATE_LABEL[f].charAt(0).toLocaleUpperCase("tr-TR") + FATE_LABEL[f].slice(1)}{" "}
                  <span className="tabular-nums text-muted">{q.data ? fmtInt(count(f)) : ""}</span>
                </button>
              ))}
            </div>
            <label className="block sm:w-[240px]">
              <span className="sr-only">Hisse ya da şirket ara</span>
              <Input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShown(PAGE);
                }} placeholder="Ara: THYAO, şirket…" />
            </label>
          </div>
        </div>
        {q.error && !q.data ? (
          <div className="px-5 pb-5">
            <ErrorState message={q.error} onRetry={q.refetch} />
          </div>
        ) : q.data ? (
          rows.length ? (
            <div className="border-t border-line">
              <DisclosureRows rows={rows.slice(0, shown)} label="Bildirim listesi" />
              {rows.length > shown ? (
                <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-2">
                  <p className="text-dense text-muted tabular-nums">
                    {fmtInt(shown)} / {fmtInt(rows.length)} gösteriliyor
                  </p>
                  <Button variant="link" onClick={() => setShown((n) => n + PAGE)}>
                    Daha fazla göster
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="border-t border-line px-5 py-8 text-center text-ui text-ink-soft">
              {q.data.length ? "Bu aramaya uyan bildirim yok." : "Bu seansta bildirim yok."}
            </p>
          )
        ) : (
          <SkeletonLines lines={6} className="px-5 pb-5" />
        )}
        {capped ? <p className="border-t border-line px-5 py-2.5 text-dense text-muted">İlk {fmtInt(MAX_DISCLOSURES)} bildirim gösteriliyor (en yeniler).</p> : null}
      </section>
    </div>
  );
}
