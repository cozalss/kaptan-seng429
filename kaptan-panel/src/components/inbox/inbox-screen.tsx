"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DayCounters, DisclosureListItem } from "@/lib/domain";
import { useApiQuery } from "@/lib/api/react";
import { useEventStream, type StreamStatus } from "@/lib/sse/use-event-stream";
import { fmtDateLong, fmtInt, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDesk } from "@/components/shell/desk-state";
import { EmptyState, ErrorState, Kbd, PageHeader, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { DisclosureDrawer } from "./disclosure-drawer";
import { FeedTable } from "./feed-table";
import { FilterBar } from "./filter-bar";
import { Funnel } from "./funnel";
import {
  DEFAULT_FILTERS,
  filledToday,
  filterRows,
  isTypingTarget,
  mergeFeed,
  moveSelection,
  withPatch,
  type FeedPatch,
  type InboxFilters,
} from "./inbox-logic";
import { ScenarioMenu } from "./scenario-menu";

/**
 * /inbox — Canlı akış (FRONTEND-SPEC §2.2, US-43, FR-35, NFR-03). "318 bildirim: bir fon
 * yöneticisi hangisini okumalı?" The funnel answers how many, the ledger answers which.
 * New rows arrive over /stream/feed (≤ 5 s) and are set down without stealing focus.
 */
export function InboxScreen() {
  const desk = useDesk();
  const q = useApiQuery((api) => api.listDisclosures({ noise: "all", page_size: 500 }), []);
  const orders = useApiQuery((api) => api.listOrders(), []);

  const [arrivals, setArrivals] = useState<DisclosureListItem[]>([]);
  const [patches, setPatches] = useState<ReadonlyMap<number, FeedPatch>>(() => new Map());
  const [unseen, setUnseen] = useState<ReadonlySet<number>>(() => new Set());
  const [announce, setAnnounce] = useState("");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [filters, setFilters] = useState<InboxFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const feedStatus = useEventStream("feed", {
    disclosure: (d) => {
      setArrivals((list) => [d, ...list.filter((x) => x.disclosure_index !== d.disclosure_index)]);
      setUnseen((s) => new Set(s).add(d.disclosure_index));
      setAnnounce(`Yeni bildirim: ${d.primary_ticker ?? ""} — ${d.subject}`);
      setLastEventAt(Date.now());
    },
    classification: (c) => {
      setPatches((p) => withPatch(p, c.disclosure_index, { classification: { event_type: c.event_type, confidence: c.confidence, method: "llm" } }));
      setLastEventAt(Date.now());
    },
    news_linked: (n) => setPatches((p) => withPatch(p, n.disclosure_index, { linked_news_count: n.count })),
    counters: () => setLastEventAt(Date.now()),
  });
  useEventStream("desk", {
    order: () => void orders.refetch(),
    fill: () => void orders.refetch(),
  });

  // Safety net for a dropped stream (reconnect, tab sleep): reconcile with the API every 30 s.
  const refetchList = q.refetch;
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refetchList();
    }, 30_000);
    return () => clearInterval(id);
  }, [refetchList]);

  const rows = useMemo(() => mergeFeed(q.data?.items ?? [], arrivals, patches), [q.data, arrivals, patches]);
  const visible = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const visibleIds = useMemo(() => visible.map((r) => r.disclosure_index), [visible]);
  const arrivedSet = useMemo(() => new Set(arrivals.map((a) => a.disclosure_index)), [arrivals]);
  const counters: DayCounters | null = desk.counters ?? q.data?.counters ?? null;
  const filled = counters && orders.data ? filledToday(orders.data, counters.as_of) : 0;
  const noiseCount = useMemo(() => rows.filter((r) => r.is_noise).length, [rows]);

  const markSeen = useCallback((index: number) => {
    setUnseen((s) => {
      if (!s.has(index)) return s;
      const next = new Set(s);
      next.delete(index);
      return next;
    });
  }, []);

  const open = useCallback(
    (index: number) => {
      setSelected(index);
      setDrawerOpen(true);
      markSeen(index);
    },
    [markSeen],
  );

  const drawerOpenRef = useRef(drawerOpen);
  const selectedRef = useRef(selected);
  useEffect(() => {
    drawerOpenRef.current = drawerOpen;
    selectedRef.current = selected;
  });

  // Keyboard triage: j/k move, Enter opens, "/" searches. Never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        setDrawerOpen(false);
        searchRef.current?.focus();
        return;
      }
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const next = moveSelection(visibleIds, selectedRef.current, e.key === "j" ? 1 : -1);
        if (next === null) return;
        selectedRef.current = next;
        setSelected(next);
        if (drawerOpenRef.current) markSeen(next);
        return;
      }
      if (e.key === "Enter" && !drawerOpenRef.current && selectedRef.current !== null && e.target === document.body) {
        e.preventDefault();
        open(selectedRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleIds, open, markSeen]);

  // Keep the selected row in view and, if a row had focus, move focus with the selection.
  useEffect(() => {
    if (selected === null) return;
    const el = document.getElementById(`bildirim-${selected}`);
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    const active = document.activeElement;
    if (active instanceof HTMLTableRowElement && active !== el && !drawerOpenRef.current) el.focus({ preventScroll: true });
  }, [selected]);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker={<span>Masa · KAP bildirimleri{counters ? ` · ${fmtDateLong(counters.as_of)}` : ""}</span>}
        title="Canlı akış"
        meta={counters ? <CountersSentence c={counters} /> : <Skeleton className="h-5 w-[420px] max-w-full" />}
        actions={
          <>
            <LiveStatus status={feedStatus === "open" ? desk.feedStatus : feedStatus} lastEventAt={lastEventAt} />
            <ScenarioMenu />
          </>
        }
      />
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>

      {counters ? <Funnel counters={counters} filled={filled} live={feedStatus === "open"} /> : <FunnelSkeleton />}

      <section aria-labelledby="feed-title" className="border-[1.5px] border-ink bg-panel">
        <h2 id="feed-title" className="sr-only">
          Bildirim tablosu
        </h2>
        <FilterBar ref={searchRef} filters={filters} onChange={setFilters} shown={visible.length} total={rows.length} noiseCount={noiseCount} />
        {q.error && !q.data ? (
          <div className="p-4">
            <ErrorState message={q.error} onRetry={q.refetch} />
          </div>
        ) : q.loading ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState title="Bugün henüz bildirim yok" body="Seans 09:40'ta açılış emir toplamayla başlar; KAP'a düşen her bildirim burada belirir." />
        ) : visible.length === 0 ? (
          <EmptyState
            title="Filtreye uyan bildirim yok"
            body="Arama ya da filtreler bugünkü bildirimlerin hepsini dışarıda bırakıyor."
            action={
              <Button size="sm" variant="secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>
                Filtreleri temizle
              </Button>
            }
          />
        ) : (
          <FeedTable rows={visible} selectedId={selected} arrived={arrivedSet} unseen={unseen} onSelect={setSelected} onOpen={open} />
        )}
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline px-4 py-2 text-meta text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Kbd>j</Kbd>
            <Kbd>k</Kbd> gezin
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>Enter</Kbd> aç
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>/</Kbd> ara
          </span>
          <span className="ml-auto">Şirketler kurgusaldır (Temsili) · KAP bağlantıları fikstürde tıklanamaz</span>
        </footer>
      </section>

      <DisclosureDrawer index={selected} open={drawerOpen} onOpenChange={setDrawerOpen} onNoteAdded={() => void q.refetch()} />
    </div>
  );
}

/** "Bugün 13:40 itibarıyla 212 bildirim · devre kesici 61 elendi · E1–E4 dışı 138 arşivlendi · işleme alındı 13" */
function CountersSentence({ c }: { c: DayCounters }) {
  const n = (v: number) => <b className="font-medium text-ink tabular-nums">{fmtInt(v)}</b>;
  return (
    <span>
      Bugün {fmtTime(c.as_of)} itibarıyla {n(c.total)} bildirim · devre kesici {n(c.noise)} elendi · E1–E4 dışı {n(c.archived)} arşivlendi · işleme alındı{" "}
      {n(c.processed)}
    </span>
  );
}

function LiveStatus({ status, lastEventAt }: { status: StreamStatus; lastEventAt: number | null }) {
  const live = status === "open";
  const label = live ? "Canlı" : status === "reconnecting" ? "Yeniden bağlanıyor" : status === "connecting" ? "Bağlanıyor" : "Bağlantı kapalı";
  return (
    <span className="inline-flex h-8 items-center gap-2 border border-rule-soft bg-panel px-2.5 text-dense text-ink-soft" role="status">
      <span aria-hidden className={cn("size-2", live ? "animate-pulse-dot bg-ink" : "border border-muted")} />
      <span className="font-medium text-ink">{label}</span>
      <span className="hidden text-meta text-muted sm:inline">
        {lastEventAt ? `son olay ${fmtTime(new Date(lastEventAt).toISOString(), true)}` : "SSE · ≤ 5 sn"}
      </span>
    </span>
  );
}

function FunnelSkeleton() {
  return (
    <div className="border-[1.5px] border-ink bg-panel p-4" aria-hidden>
      <Skeleton className="h-4 w-40" />
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  );
}

function TableSkeleton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 300);
    return () => clearTimeout(t);
  }, []);
  return (
    <div role="status" aria-label="Bildirimler yükleniyor" className="divide-y divide-hairline">
      {show
        ? Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex h-10 items-center gap-4 px-4">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className={cn("h-3", i % 3 === 0 ? "w-1/2" : i % 3 === 1 ? "w-1/3" : "w-2/5")} />
              <Skeleton className="ml-auto h-3 w-16" />
            </div>
          ))
        : <div className="h-40" />}
    </div>
  );
}
