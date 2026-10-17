"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApiQuery } from "@/lib/api/react";
import { fmtInt } from "@/lib/format";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { cn, prefersReducedMotion } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ErrorState, SkeletonLines } from "@/components/ui/primitives";
import { CARD, PageTitle } from "@/components/portfolio/kit";
import { useChainWalk, VERIFY_EVENT } from "./chain-walk";
import { rowId, Timeline, type Scope } from "./ledger";
import { VerifyPanel } from "./verify-panel";

/** Records shown at first; "Daha fazla göster" adds as many again (the API caps at 500). */
const PAGE = 30;
const MAX = 500;

/**
 * /denetim — "Defteri doğrula" with a clear verdict, then the ledger as a table (time, who,
 * what, record #) with a Bugün / Tümü filter and a search.
 */
export function AuditScreen() {
  const [scope, setScope] = useState<Scope>("today");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  // The record "Defterde göster →" asked for, until the list holds it.
  const target = useRef<number | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 200);
    return () => clearTimeout(id);
  }, [search]);

  const list = useApiQuery((api) => api.auditList({ scope, q: q || undefined, limit }), [scope, q, limit]);
  const { walk, verify } = useChainWalk(list.data?.length ?? 0);
  // New records arrive with every counter tick (the crew keeps reading) and every decision.
  useEventStream("feed", { counters: () => void list.refetch() });
  useEventStream("desk", {
    "approval.decided": () => void list.refetch(),
    kill_switch: () => void list.refetch(),
    "limits.changed": () => void list.refetch(),
  });

  useEffect(() => {
    const onVerify = () => void verify();
    window.addEventListener(VERIFY_EVENT, onVerify);
    return () => window.removeEventListener(VERIFY_EVENT, onVerify);
  }, [verify]);

  // "Defterde göster →": once the list holds the record, bring it into view and focus it.
  useEffect(() => {
    const pos = target.current;
    const row = pos === null ? null : document.getElementById(rowId(pos));
    if (!row) return;
    target.current = null;
    row.setAttribute("tabindex", "-1");
    if (typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    row.focus({ preventScroll: true });
  }, [list.data]);

  const showRecord = useCallback((pos: number) => {
    target.current = pos;
    setScope("all");
    setLimit(PAGE);
    setSearch(`#${pos}`);
  }, []);

  const broken = walk.phase === "done" && !walk.result.ok ? walk.result.first_bad_pos : null;
  const data = list.data;
  const more = data !== undefined && data.items.length < data.total && limit < MAX;
  // Asked for more than we hold and the list is fetching: the link says so (it stays put).
  const growing = list.refreshing && data !== undefined && data.items.length < Math.min(limit, data.total);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <PageTitle>Denetim</PageTitle>
        <p className="text-body text-ink-soft">Her bildirim, imza ve durdurma bu deftere yazılır; kimse silemez.</p>
      </div>

      <VerifyPanel walk={walk} onVerify={() => void verify()} onShow={showRecord} tamperOn={data?.tamper_on ?? false} />

      <section aria-labelledby="kayitlar" className={CARD}>
        <div className="flex flex-col gap-3 px-4 pt-4 pb-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pt-5">
          <h2 id="kayitlar" className="text-[18px] leading-7 font-semibold text-ink">
            Kayıtlar
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div role="group" aria-label="Hangi kayıtlar" className="inline-flex self-start rounded-full bg-sunk p-1">
              {(["today", "all"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={scope === s}
                  onClick={() => {
                    setScope(s);
                    setLimit(PAGE);
                  }}
                  className={cn(
                    "h-9 rounded-full px-4 text-dense font-medium transition-colors duration-[var(--dur-quick)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-sm:h-10",
                    scope === s ? "bg-panel text-ink shadow-[0_1px_3px_rgb(16_17_23/0.18)]" : "text-ink-soft hover:text-ink",
                  )}
                >
                  {s === "today" ? "Bugün" : "Tümü"}
                </button>
              ))}
            </div>
            <label className="block sm:w-[260px]">
              <span className="sr-only">Defterde ara</span>
              <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ara: şirket, rol, #3907…" />
            </label>
          </div>
        </div>

        {list.error && !data ? (
          <div className="px-4 pb-5 sm:px-6">
            <ErrorState message={list.error} onRetry={list.refetch} />
          </div>
        ) : null}
        {data ? (
          <>
            {data.items.length ? (
              <Timeline items={data.items} scope={scope} broken={broken} />
            ) : (
              <p className="border-t-2 border-hairline px-4 py-8 text-center text-ui text-ink-soft sm:px-6">Bu aramaya uyan kayıt yok.</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-hairline px-4 py-2 sm:px-6">
              <p role="status" aria-live="polite" className="text-dense text-muted tabular-nums">
                {data.items.length < data.total
                  ? `En yeni ${fmtInt(data.items.length)} kayıt · bu görünümde ${fmtInt(data.total)} · defterin tamamı ${fmtInt(data.length)}`
                  : `${fmtInt(data.total)} kayıt · defterde ${fmtInt(data.length)}`}
              </p>
              {more ? (
                <Button variant="link" pending={growing} onClick={() => setLimit((n) => Math.min(MAX, n + PAGE * 2))}>
                  Daha fazla göster
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <SkeletonLines lines={6} className="px-4 pb-5 sm:px-6" />
        )}
      </section>
    </div>
  );
}
