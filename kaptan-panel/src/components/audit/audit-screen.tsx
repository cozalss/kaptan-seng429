"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApiQuery } from "@/lib/api/react";
import { fmtInt } from "@/lib/format";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { cn, prefersReducedMotion } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ErrorState, SkeletonLines } from "@/components/ui/primitives";
import { BigSentence, Kicker, Lead } from "@/components/story/ui";
import { useChainWalk, VERIFY_EVENT } from "./chain-walk";
import { rowId, Timeline, type Scope } from "./ledger";
import { VerifyPanel } from "./verify-panel";

/** Records shown at first; "Daha fazla göster" adds as many again (the API caps at 500). */
const PAGE = 30;
const MAX = 500;

/**
 * /denetim — the audit ledger as a plain ruled list: who did what, when, and each record's
 * place in the chain. One big action, "Defteri doğrula", walks the hash chain in front of you.
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
    <div className="space-y-12">
      <header className="space-y-4">
        <Kicker>Denetim defteri</Kicker>
        <BigSentence focusTarget>Her adım bir deftere yazılır.</BigSentence>
        <Lead className="max-w-[600px]">Tayfanın okuduğu her bildirim, her imza, her durdurma buraya yazılır; kimse silemez.</Lead>
      </header>

      <VerifyPanel walk={walk} onVerify={() => void verify()} onShow={showRecord} tamperOn={data?.tamper_on ?? false} />

      <section aria-labelledby="kayitlar" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="kayitlar" className="label">
            Ne oldu?
          </h2>
          <div role="group" aria-label="Hangi kayıtlar" className="flex border-2 border-ink">
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
                  "h-11 px-4 text-ui transition-colors duration-[var(--dur-quick)] sm:h-9",
                  scope === s ? "bg-ink text-on-dark" : "bg-panel text-ink hover:bg-wash-tint",
                )}
              >
                {s === "today" ? "Bugün" : "Tümü"}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="sr-only">Defterde ara</span>
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ara: şirket, rol, olay, #3907…" />
        </label>

        {list.error && !data ? <ErrorState message={list.error} onRetry={list.refetch} /> : null}
        {data ? (
          <>
            <p role="status" aria-live="polite" className="text-dense text-muted tabular-nums">
              {data.items.length < data.total
                ? `En yeni ${fmtInt(data.items.length)} kayıt · bu görünümde ${fmtInt(data.total)} · defterin tamamı ${fmtInt(data.length)}`
                : `${fmtInt(data.total)} kayıt · defterde ${fmtInt(data.length)}`}
            </p>
            {data.items.length ? <Timeline items={data.items} scope={scope} broken={broken} /> : <p className="text-[16px] text-ink-soft">Bu aramaya uyan kayıt yok.</p>}
            {more ? (
              <Button variant="link" pending={growing} onClick={() => setLimit((n) => Math.min(MAX, n + PAGE * 2))}>
                Daha fazla göster
              </Button>
            ) : null}
          </>
        ) : (
          <SkeletonLines lines={6} />
        )}
      </section>
    </div>
  );
}
