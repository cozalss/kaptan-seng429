"use client";

import Link from "next/link";
import type { AuditEntry } from "@/lib/domain";
import { useApiQuery } from "@/lib/api/react";
import { fmtDate, fmtInt, fmtSignedPct, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HashChip } from "@/components/ui/data";
import { ErrorState, SkeletonLines } from "@/components/ui/primitives";
import { actorLabel } from "./risk-math";

const RISK_ACTIONS = ["kill_switch.", "risk.halted"] as const;
const LOG_SIZE = 6;

const ACTION_TEXT: Readonly<Record<string, { text: string; tone: "north" | "ochre" | "ink" }>> = {
  "kill_switch.on": { text: "Kill switch açıldı", tone: "north" },
  "kill_switch.reset_requested": { text: "Sıfırlama başlatıldı (1/2)", tone: "ink" },
  "kill_switch.reset": { text: "Sıfırlama onaylandı (2/2)", tone: "ink" },
  "risk.halted": { text: "Yeni emir durdu (günlük −%1)", tone: "ochre" },
};

/** Merge and order risk events from the hash chain (newest first). */
export function riskEvents(pages: ReadonlyArray<readonly AuditEntry[]>, size = LOG_SIZE): AuditEntry[] {
  const byPos = new Map<number, AuditEntry>(pages.flat().map((e) => [e.chain_pos, e]));
  return [...byPos.values()].sort((a, b) => b.chain_pos - a.chain_pos).slice(0, size);
}

export function eventDetail(e: Pick<AuditEntry, "action" | "payload">): string | null {
  const p = e.payload as Record<string, unknown>;
  if (typeof p.reason === "string") return p.reason;
  if (typeof p.comment === "string") return p.comment;
  if (typeof p.daily_pnl_pct === "number") return `Günlük K/Z ${fmtSignedPct(p.daily_pnl_pct, 2)}`;
  return null;
}

/**
 * Risk events straight from the audit chain (kill switch, resets, daily halt) — so the demo's
 * loss simulation leaves a visible, verifiable trail on the same screen (11 Adım 4).
 */
export function RiskLog({ refreshKey }: { refreshKey: string }) {
  const q = useApiQuery((api) => Promise.all(RISK_ACTIONS.map((a) => api.audit({ action: a, page_size: LOG_SIZE }))), [refreshKey]);
  if (q.loading) return <SkeletonLines lines={3} className="p-4" />;
  if (q.error || !q.data) return <div className="p-4"><ErrorState message={q.error ?? ""} onRetry={q.refetch} /></div>;
  const events = riskEvents(q.data.map((p) => p.items));
  if (!events.length) return <p className="px-4 py-5 text-ui text-muted">Henüz risk olayı yok: durdurma, kill switch ve sıfırlamalar audit zincirinden burada listelenir.</p>;
  return (
    <ol className="divide-y divide-hairline" aria-live="polite">
      {events.map((e) => {
        const a = ACTION_TEXT[e.action] ?? { text: e.action, tone: "ink" as const };
        const detail = eventDetail(e);
        return (
          <li key={e.chain_pos} className="grid grid-cols-[auto_1fr] gap-x-3 px-4 py-2.5 sm:grid-cols-[88px_1fr_auto]">
            <time dateTime={e.occurred_at} className="text-dense tabular-nums text-ink-soft">
              {fmtTime(e.occurred_at, true)}
              <span className="block text-meta text-muted">{fmtDate(e.occurred_at)}</span>
            </time>
            <div className="min-w-0">
              <p className={cn("text-dense font-medium", a.tone === "north" ? "text-north" : "text-ink")}>
                {a.tone === "ochre" ? <span aria-hidden className="mr-1.5 inline-block size-2 border border-ink bg-ochre" /> : null}
                {a.text}
              </p>
              <p className="truncate text-meta text-muted">
                {actorLabel(e.actor)}
                {detail ? ` · ${detail}` : ""}
              </p>
            </div>
            <div className="col-span-2 mt-1 flex items-center gap-2 sm:col-span-1 sm:mt-0">
              <Link href="/audit" className="text-meta tabular-nums text-ink-soft underline underline-offset-4">
                #{fmtInt(e.chain_pos)}
              </Link>
              <HashChip hash={e.hash} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
