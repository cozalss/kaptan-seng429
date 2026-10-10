"use client";

import { useEffect, useState } from "react";
import type { AuditEntry } from "@/lib/domain";
import { actorParts } from "@/lib/actors";
import { auditSentence } from "@/lib/audit-words";
import { useApiQuery } from "@/lib/api/react";
import { fmtInt, fmtShortDate, fmtTime } from "@/lib/format";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/field";
import { ErrorState, SkeletonLines } from "@/components/ui/primitives";
import { BigSentence, Kicker, Lead } from "@/components/story/ui";
import { useChainWalk, VERIFY_EVENT } from "./chain-walk";
import { VerifyPanel } from "./verify-panel";

type Scope = "today" | "all";

/** Records shown at first; "Daha fazla göster" adds as many again (the API caps at 500). */
const PAGE = 30;

/**
 * /denetim — the audit ledger as a plain timeline: who did what, when, each with a tiny hash
 * chip. One big action, "Defteri doğrula", walks the hash chain in front of you.
 */
export function AuditScreen() {
  const [scope, setScope] = useState<Scope>("today");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
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

  const broken = walk.phase === "done" && !walk.result.ok ? walk.result.first_bad_pos : null;

  return (
    <div className="space-y-12">
      <header className="space-y-4">
        <Kicker>Denetim defteri</Kicker>
        <BigSentence>Her adım bir deftere yazılır.</BigSentence>
        <Lead className="max-w-[600px]">
          Tayfanın okuduğu her bildirim, her imza, her durdurma buraya eklenir; silinmez, değiştirilmez. Deftere dokunulursa zincir kırılır.
        </Lead>
      </header>

      <VerifyPanel walk={walk} onVerify={() => void verify()} tamperOn={list.data?.tamper_on ?? false} />

      <section aria-labelledby="kayitlar" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="kayitlar" className="text-[13px] font-medium tracking-[0.04em] text-ink uppercase">
            Ne oldu?
          </h2>
          <div role="group" aria-label="Hangi kayıtlar" className="flex border-[1.5px] border-ink">
            {(["today", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={scope === s}
                onClick={() => {
                  setScope(s);
                  setLimit(PAGE);
                }}
                className={cn("h-9 px-4 text-[14px]", scope === s ? "bg-ink text-on-dark" : "bg-panel text-ink hover:bg-wash-tint")}
              >
                {s === "today" ? "Bugün" : "Tümü"}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="sr-only">Defterde ara</span>
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ara: şirket, rol, olay…" />
        </label>

        {list.error && !list.data ? <ErrorState message={list.error} onRetry={list.refetch} /> : null}
        {list.data ? (
          <>
            <p className="text-[13px] text-muted tabular-nums">
              {list.data.items.length < list.data.total
                ? `En yeni ${fmtInt(list.data.items.length)} kayıt · bu görünümde ${fmtInt(list.data.total)} · defterin tamamı ${fmtInt(list.data.length)}`
                : `${fmtInt(list.data.total)} kayıt · defterde ${fmtInt(list.data.length)}`}
            </p>
            {list.data.items.length ? <Timeline items={list.data.items} scope={scope} broken={broken} /> : <p className="text-[16px] text-ink-soft">Bu aramaya uyan kayıt yok.</p>}
            {list.data.items.length < list.data.total && limit < 500 ? (
              <button
                type="button"
                onClick={() => setLimit((n) => Math.min(500, n + PAGE * 2))}
                className="text-[15px] text-ink underline decoration-rule-soft underline-offset-4 hover:decoration-ink"
              >
                Daha fazla göster
              </button>
            ) : null}
          </>
        ) : (
          <SkeletonLines lines={6} />
        )}
      </section>
    </div>
  );
}

function Timeline({ items, scope, broken }: { items: AuditEntry[]; scope: Scope; broken: number | null }) {
  return (
    <ol aria-label="Denetim kayıtları" className="divide-y divide-hairline border-y border-hairline">
      {items.map((e) => {
        const who = actorParts(e.actor);
        const bad = broken !== null && e.chain_pos === broken;
        return (
          <li key={e.chain_pos} className={cn("grid grid-cols-[52px_minmax(0,1fr)] gap-x-4 py-3.5 sm:grid-cols-[64px_minmax(0,1fr)_auto]", bad && "bg-north-tint")}>
            <time dateTime={e.occurred_at} className="pt-[2px] text-[14px] text-ink tabular-nums">
              {scope === "today" ? fmtTime(e.occurred_at) : fmtShortDate(e.occurred_at)}
            </time>
            <div className="min-w-0">
              <p className={cn("text-[16px] leading-[24px]", bad ? "text-north" : "text-ink")}>{auditSentence(e)}</p>
              <p className="mt-0.5 text-[13px] text-muted">
                {who.name}
                {who.kind ? ` · ${who.kind}` : ""}
                {scope === "all" ? ` · ${fmtTime(e.occurred_at)}` : ""}
              </p>
            </div>
            <span
              title={`Kayıt #${e.chain_pos} · özet ${e.hash}`}
              className={cn(
                "col-start-2 mt-1.5 inline-flex w-fit items-center gap-1.5 self-start border px-1.5 text-[11px] leading-[18px] sm:col-start-3 sm:mt-[3px]",
                bad ? "border-north text-north" : "border-rule-soft text-ink-soft",
              )}
            >
              <span className="tabular-nums">#{fmtInt(e.chain_pos)}</span>
              <span className="code">{e.hash.slice(0, 8)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
