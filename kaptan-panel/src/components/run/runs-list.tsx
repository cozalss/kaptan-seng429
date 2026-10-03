"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RunStatus, RunSummary } from "@/lib/domain";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { fmtCompact, fmtDate, fmtInt, fmtLatency, fmtTime } from "@/lib/format";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { cn } from "@/lib/utils";
import { EventBadge, FixtureBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { DataTable, type Column } from "@/components/ui/table";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { OUTCOME_ORDER, outcomeLabel, STATUS_LABEL, type OutcomeKey } from "./labels";
import { applyFilter, countByOutcome, DEFAULT_FILTER, filterToParams, istanbulDay, listTotals, outcomeKey, parseFilter, type RunFilter } from "./runs-filter";
import { ToneBadge } from "./section";

/**
 * /runs — every graph run, today and history (FRONTEND-SPEC §2.4, §9 Ç-19): a dense, sortable
 * ledger with an outcome bar that doubles as a filter. Filters live in the URL. Rows open
 * "Neden bu işlem?".
 */
export const RUNS_POLL_MS = 2_000;

function OutcomeCell({ r }: { r: RunSummary }) {
  const o = outcomeLabel(outcomeKey(r));
  return <ToneBadge tone={o.tone}>{r.outcome ? o.short : r.status === "running" ? "—" : "Arşiv"}</ToneBadge>;
}

function StatusCell({ s }: { s: RunStatus }) {
  const l = STATUS_LABEL[s];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-dense", s === "running" || s === "interrupted" ? "text-wash" : s === "failed" ? "text-north" : "text-ink-soft")}>
      <span aria-hidden className={cn("inline-block size-1.5", s === "running" ? "animate-pulse-dot bg-wash" : s === "interrupted" ? "bg-wash" : s === "failed" ? "bg-north" : "bg-rule-soft")} />
      {l.tr}
    </span>
  );
}

function when(r: RunSummary, today: string | null): string {
  return today && istanbulDay(r.started_at) === today ? fmtTime(r.started_at) : `${fmtDate(r.started_at)} ${fmtTime(r.started_at)}`;
}

function columns(today: string | null): Column<RunSummary>[] {
  return [
    { key: "at", header: "Başlangıç", cell: (r) => <time dateTime={r.started_at} className="whitespace-nowrap">{when(r, today)}</time>, sortValue: (r) => r.started_at },
    {
      key: "ticker",
      header: "Hisse",
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2">
            <Link href={`/runs/${r.run_id}`} onClick={(e) => e.stopPropagation()} className="code font-medium text-ink underline-offset-4 hover:underline">
              {r.ticker}
            </Link>
            {r.is_fixture ? <FixtureBadge /> : null}
          </span>
          <span className="truncate text-meta text-muted">{r.company_name}</span>
        </span>
      ),
      sortValue: (r) => r.ticker,
    },
    { key: "event", header: "Olay", cell: (r) => (r.event_type ? <EventBadge type={r.event_type} compact /> : <span className="text-muted">—</span>), sortValue: (r) => r.event_type ?? "Z" },
    { key: "outcome", header: "Sonuç", cell: (r) => <OutcomeCell r={r} />, sortValue: (r) => OUTCOME_ORDER.indexOf(outcomeKey(r)) },
    { key: "status", header: "Durum", cell: (r) => <StatusCell s={r.status} />, sortValue: (r) => r.status },
    { key: "llm", header: "LLM", cell: (r) => <span className={r.llm_calls === 0 ? "font-medium text-ink" : undefined}>{r.llm_calls}</span>, sortValue: (r) => r.llm_calls, align: "right" },
    { key: "tokens", header: "Token", cell: (r) => (r.tokens_in + r.tokens_out ? fmtCompact(r.tokens_in + r.tokens_out) : "0"), sortValue: (r) => r.tokens_in + r.tokens_out, align: "right" },
    { key: "latency", header: "Süre", cell: (r) => (r.finished_at ? fmtLatency(r.latency_ms) : "…"), sortValue: (r) => r.latency_ms, align: "right" },
    { key: "version", header: "Sürüm", cell: (r) => <span className="code text-ink-soft">{r.strategy_version}</span>, sortValue: (r) => r.strategy_version, className: "hidden lg:table-cell", headerClassName: "hidden lg:table-cell" },
  ];
}

function OutcomeBar({ rows, active, onPick }: { rows: readonly RunSummary[]; active: OutcomeKey | "all"; onPick: (k: OutcomeKey | "all") => void }) {
  const counts = countByOutcome(rows);
  return (
    <div role="group" aria-label="Sonuca göre süz" className="flex flex-wrap border-[1.5px] border-ink bg-panel md:flex-nowrap">
      {OUTCOME_ORDER.filter((k) => counts[k] > 0).map((k, i) => {
        const l = outcomeLabel(k);
        const on = active === k;
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(on ? "all" : k)}
            style={{ flexGrow: Math.max(1, counts[k]) }}
            className={cn(
              "group relative min-w-[118px] basis-0 px-3 pt-2.5 pb-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
              i > 0 && "border-l border-hairline",
              on ? "bg-ink text-on-dark" : "hover:bg-wash-tint",
            )}
          >
            <span className={cn("block text-meta", on ? "text-on-dark/80" : "text-muted")}>{l.short}</span>
            <span className={cn("block font-display text-[28px] leading-none tabular-nums", !on && (k === "QUARANTINED" || k === "PREGATE_VETO") && "text-north")}>{counts[k]}</span>
            <span aria-hidden className={cn("absolute right-0 bottom-0 left-0 h-[4px]", on ? "bg-on-dark" : k === "QUARANTINED" || k === "PREGATE_VETO" ? "bg-north" : k === "PROPOSE" ? "bg-ink" : "bg-rule-soft")} />
          </button>
        );
      })}
    </div>
  );
}

const SELECT_CLS = "h-9 border-[1.5px] border-ink bg-panel px-2 text-dense text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

export function RunsList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = useMemo(() => parseFilter(new URLSearchParams(params.toString())), [params]);
  const q = useApiQuery((api) => api.listRuns(), []);
  const now = useNow(30_000);
  const today = now === null ? null : istanbulDay(new Date(now).toISOString());

  const setFilter = useCallback((patch: Partial<RunFilter>) => router.replace(`${pathname}${filterToParams({ ...filter, ...patch })}`, { scroll: false }), [router, pathname, filter]);

  const [qText, setQText] = useState(filter.q);
  useEffect(() => {
    if (qText === filter.q) return;
    const id = setTimeout(() => setFilter({ q: qText }), 180);
    return () => clearTimeout(id);
  }, [qText, filter.q, setFilter]);

  const { refetch } = q;
  useEventStream("feed", { disclosure: () => void refetch(), classification: () => void refetch() });
  useEventStream("desk", { "approval.requested": () => void refetch(), "approval.decided": () => void refetch(), fill: () => void refetch() });
  const anyRunning = (q.data ?? []).some((r) => r.status === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => void refetch(), RUNS_POLL_MS);
    return () => clearInterval(id);
  }, [anyRunning, refetch]);

  const all = q.data ?? [];
  const scoped = applyFilter(all, { ...filter, outcome: "all", status: "all" }, today);
  const rows = applyFilter(all, filter, today);
  const totals = listTotals(scoped);
  const cols = columns(today);
  const dirty = filterToParams(filter) !== "";

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Masa · grafın her koşusu"
        title="Çalıştırmalar"
        meta="Her bildirim için bir koşu: ön eleme, altı ajan, kural motoru, risk kapısı, insan onayı. Satırı açın — “Neden bu işlem?”."
        actions={
          q.data ? (
            <p className="text-right text-dense text-ink-soft">
              <span className="font-display text-[28px] leading-none text-ink tabular-nums">{totals.runs}</span> koşu ·{" "}
              <span className="tabular-nums">{fmtInt(totals.llmCalls)}</span> LLM çağrısı · <span className="tabular-nums">{fmtCompact(totals.tokens)}</span> token
              {totals.running ? <span className="ml-2 text-wash">· {totals.running} canlı</span> : null}
            </p>
          ) : null
        }
      />

      {q.loading && !q.data ? (
        <div className="space-y-3" role="status" aria-label="Çalıştırmalar yükleniyor">
          <Skeleton className="h-16 w-full" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : q.error && !q.data ? (
        <ErrorState message={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          {scoped.length ? <OutcomeBar rows={scoped} active={filter.outcome} onPick={(k) => setFilter({ outcome: k })} /> : null}

          <form role="search" aria-label="Çalıştırma süzgeci" onSubmit={(e) => e.preventDefault()} className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-meta text-muted sm:max-w-[320px]">
              Ara
              <Input type="search" value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Hisse, şirket, run id, idx" className="h-9 text-dense" />
            </label>
            <label className="flex flex-col gap-1 text-meta text-muted">
              Durum
              <select className={SELECT_CLS} value={filter.status} onChange={(e) => setFilter({ status: e.target.value as RunFilter["status"] })}>
                <option value="all">Tümü</option>
                {(Object.keys(STATUS_LABEL) as RunStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s].tr}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-meta text-muted">
              Dönem
              <select className={SELECT_CLS} value={filter.scope} onChange={(e) => setFilter({ scope: e.target.value as RunFilter["scope"] })}>
                <option value="all">Bugün + geçmiş</option>
                <option value="today">Yalnızca bugün</option>
                <option value="history">Yalnızca geçmiş</option>
              </select>
            </label>
            <label className="flex h-9 items-center gap-2 text-dense text-ink">
              <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={filter.fixtureOnly} onChange={(e) => setFilter({ fixtureOnly: e.target.checked })} />
              Yalnızca demo fikstürü
            </label>
            {dirty ? (
              <Button size="sm" variant="ghost" onClick={() => {
                  setQText("");
                  router.replace(pathname, { scroll: false });
                }}>
                Süzgeci temizle
              </Button>
            ) : null}
            <p className="ml-auto text-meta text-muted" aria-live="polite">
              {rows.length} / {all.length} koşu gösteriliyor
            </p>
          </form>

          {rows.length === 0 ? (
            <div className="border-[1.5px] border-ink bg-panel">
              <EmptyState
                title={all.length ? "Bu süzgece uyan koşu yok" : "Henüz çalıştırma yok"}
                body={all.length ? "Süzgeci gevşetin ya da temizleyin." : "Seans 09:40'ta açılış emir toplamayla başlar; ilk bildirim gelince graf çalışır."}
                action={
                  dirty ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setQText("");
                        setFilter(DEFAULT_FILTER);
                      }}
                    >
                      Süzgeci temizle
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              <div className="hidden border-[1.5px] border-ink bg-panel md:block">
                <DataTable
                  caption="Çalıştırmalar: başlangıç, hisse, olay, sonuç, durum, LLM çağrısı, token, süre, sürüm"
                  columns={cols}
                  rows={rows}
                  getRowId={(r) => r.run_id}
                  onRowClick={(r) => router.push(`/runs/${r.run_id}`)}
                  initialSort={{ key: "at", dir: "desc" }}
                  rowClassName={(r) => (r.outcome === "QUARANTINED" || r.outcome === "PREGATE_VETO" ? "shadow-[inset_3px_0_0_var(--north)]" : r.status === "running" ? "bg-wash-tint" : undefined)}
                  stickyHeader
                />
              </div>
              <ul className="space-y-2 md:hidden" aria-label="Çalıştırmalar">
                {[...rows].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)).map((r) => (
                  <li key={r.run_id}>
                    <Link
                      href={`/runs/${r.run_id}`}
                      className={cn("block border-[1.5px] border-ink bg-panel px-3 py-2.5 hover:bg-wash-tint", (r.outcome === "QUARANTINED" || r.outcome === "PREGATE_VETO") && "border-l-[4px] border-l-north")}
                    >
                      <span className="flex items-center gap-2">
                        <span className="code font-medium text-ink">{r.ticker}</span>
                        {r.event_type ? <EventBadge type={r.event_type} compact /> : null}
                        <OutcomeCell r={r} />
                        <span className="ml-auto text-meta text-muted tabular-nums">{when(r, today)}</span>
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-meta text-muted">
                        <span className="min-w-0 flex-1 truncate">{r.company_name}</span>
                        <StatusCell s={r.status} />
                      </span>
                      <span className="mt-1 block text-meta text-muted tabular-nums">
                        LLM {r.llm_calls} · {fmtCompact(r.tokens_in + r.tokens_out)} token · {r.finished_at ? fmtLatency(r.latency_ms) : "sürüyor"}
                        {r.is_fixture ? " · DEMO FİKSTÜRÜ" : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
