"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ApprovalCard } from "@/lib/domain";
import { ROLE_LABEL } from "@/lib/domain";
import { useApiMutation, useApiQuery } from "@/lib/api/react";
import { useSession } from "@/lib/auth/session-context";
import { useNow } from "@/lib/clock";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { fmtInt, fmtTry } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDesk } from "@/components/shell/desk-state";
import { EmptyState, ErrorState, Kbd, PageHeader, Skeleton, SkeletonLines } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import { isTypingTarget } from "@/components/inbox/inbox-logic";
import { ApprovalCardView } from "./approval-card";
import {
  buildDecision,
  decideGate,
  effectiveStatus,
  isOpen,
  sortQueue,
  upsertCards,
  type DecisionDraft,
  type DecisionKind,
} from "./approvals-logic";
import { DecisionDialog } from "./decision-dialog";
import { QueueList } from "./queue-list";

/**
 * /approvals — Onay kuyruğu (FRONTEND-SPEC §2.3, US-26/27/28, FR-24, NFR-21). The graph
 * stopped at `interrupt()`; this is where a human resumes it. Cards arrive live over
 * /stream/desk; only the Risk Officer decides, everyone else reads the same card.
 */
export function ApprovalsScreen() {
  const user = useSession();
  const desk = useDesk();
  const nowMs = useNow(1_000);
  const params = useSearchParams();
  const q = useApiQuery((api) => api.listApprovals("all"), []);

  const [live, setLive] = useState<ApprovalCard[]>([]);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const [arrival, setArrival] = useState<ApprovalCard | null>(null);
  const [view, setView] = useState<"open" | "decided">("open");
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get("oneri"));
  const [dialog, setDialog] = useState<DecisionKind | null>(null);
  const [execTick, setExecTick] = useState(0);
  const detailRef = useRef<HTMLDivElement>(null);

  useEventStream("desk", {
    "approval.requested": (card) => {
      setLive((l) => [card, ...l.filter((x) => x.proposal_id !== card.proposal_id)]);
      setFresh((s) => new Set(s).add(card.proposal_id));
      setArrival(card);
    },
    "approval.decided": (card) => setLive((l) => [card, ...l.filter((x) => x.proposal_id !== card.proposal_id)]),
    order: () => setExecTick((t) => t + 1),
    fill: () => setExecTick((t) => t + 1),
    kill_switch: () => void q.refetch(),
  });

  // Safety net for a dropped stream (reconnect, reload mid-run): reconcile every 10 s.
  const refetchList = q.refetch;
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refetchList();
    }, 10_000);
    return () => clearInterval(id);
  }, [refetchList]);

  const all = useMemo(() => upsertCards(q.data ?? [], live), [q.data, live]);
  const sorted = sortQueue(all, nowMs);
  const openCards = sorted.filter((c) => isOpen(effectiveStatus(c, nowMs)));
  const decidedCards = sorted.filter((c) => !isOpen(effectiveStatus(c, nowMs)));
  const list = view === "open" ? openCards : decidedCards;
  const current = all.find((c) => c.proposal_id === selectedId) ?? list[0] ?? openCards[0] ?? sorted[0] ?? null;
  const status = current ? effectiveStatus(current, nowMs) : null;
  const killOn = desk.risk?.kill_switch === "on";
  const gate = current && status ? decideGate({ role: user.role, status, killSwitchOn: killOn, haltedToday: desk.risk?.halted_today ?? false }) : null;

  const decidedRun = current && status && !isOpen(status) ? current.run_id : null;
  const ex = useApiQuery((api) => (decidedRun ? api.explain(decidedRun) : Promise.resolve(null)), [decidedRun, execTick, current?.status]);
  const explain = ex.data && decidedRun && ex.data.run.run_id === decidedRun ? ex.data : null;

  const decide = useApiMutation((api, id: string, draft: DecisionDraft) => api.decideApproval(id, buildDecision(draft)));

  const select = (id: string) => {
    setSelectedId(id);
    setFresh((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    if (window.matchMedia?.("(max-width: 1023px)").matches) detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const submit = async (draft: DecisionDraft) => {
    if (!current) return;
    // Pin the card: once decided it leaves the open list but must stay on screen with its outcome.
    setSelectedId(current.proposal_id);
    const result = await decide.run(current.proposal_id, draft);
    if (!result) {
      void q.refetch();
      return;
    }
    setLive((l) => [result, ...l.filter((x) => x.proposal_id !== result.proposal_id)]);
    setDialog(null);
    if (result.status === "approved") {
      notify.success(`Onaylandı: ${result.ticker}`, `Graf devam etti (resume) · ${result.approved_notional_try ? `küçültülmüş ${fmtTry(result.approved_notional_try)}` : fmtTry(result.final_notional_try)} SimBIST'e yazılıyor.`);
    } else {
      notify.info(`Reddedildi: ${result.ticker}`, "Emir yazılmadı; karar audit kaydına işlendi.");
    }
  };

  // j/k move through the visible queue (never while typing or with a dialog open).
  const listRef = useRef(list);
  const currentRef = useRef(current);
  useEffect(() => {
    listRef.current = list;
    currentRef.current = current;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key !== "j" && e.key !== "k") return;
      if (document.querySelector('[role="dialog"]')) return;
      const ids = listRef.current.map((c) => c.proposal_id);
      if (!ids.length) return;
      e.preventDefault();
      const at = currentRef.current ? ids.indexOf(currentRef.current.proposal_id) : -1;
      const next = ids[Math.min(ids.length - 1, Math.max(0, at + (e.key === "j" ? 1 : -1)))] ?? ids[0];
      if (next) {
        setSelectedId(next);
        document.getElementById(`oneri-${next}`)?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const readOnly = user.role !== "risk_officer";

  return (
    <div className="space-y-4">
      <PageHeader
        kicker="Masa · insan onayı"
        title="Onay kuyruğu"
        meta={
          <>
            {"Risk kapısından geçen her öneri burada bir insan kararını bekler; yanıtlanmazsa ertesi seansın 09:50'sinde düşer. "}
            <b className="font-medium text-ink tabular-nums">{fmtInt(openCards.length)}</b> bekliyor.
          </>
        }
        className="pb-3 [&_h1]:sm:text-[38px]"
      />

      {readOnly ? (
        <p role="note" className="flex flex-wrap items-center gap-x-2 border-l-[3px] border-wash bg-wash-tint px-3 py-2 text-dense text-ink">
          <b className="font-medium">Salt okunur · {ROLE_LABEL[user.role]}.</b>
          <span className="text-ink-soft">Kararı yalnızca Risk Officer verir (görevler ayrılığı, 09 §5); kartlar aynen görünür, düğmeler kapalıdır.</span>
        </p>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {arrival ? `Yeni onay talebi: ${arrival.ticker}, ${arrival.headline_tr}. Graf interrupt ile durdu, karar bekleniyor.` : ""}
      </p>

      {q.error && !q.data ? (
        <ErrorState message={q.error} onRetry={q.refetch} />
      ) : q.loading ? (
        <LoadingLayout />
      ) : all.length === 0 ? (
        <div className="border-[1.5px] border-ink bg-panel">
          <EmptyState title="Bekleyen onay yok" body="Risk kapısından geçen her öneri burada bir insan kararını bekler. Yeni bir öneri geldiğinde kart kendiliğinden belirir." />
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside aria-label="Onay kuyruğu listesi" className="border-[1.5px] border-ink bg-panel lg:sticky lg:top-[calc(var(--chrome-top,0px)+var(--topbar-h)+16px)]">
            <div role="group" aria-label="Görünüm" className="grid grid-cols-2 border-b-[1.5px] border-ink">
              {(["open", "decided"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "h-10 text-dense font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
                    v === "decided" && "border-l border-ink",
                    view === v ? "bg-ink text-on-dark" : "bg-panel text-ink hover:bg-wash-tint",
                  )}
                >
                  {v === "open" ? "Bekleyen" : "Karara bağlanan"} <span className="tabular-nums opacity-80">{v === "open" ? openCards.length : decidedCards.length}</span>
                </button>
              ))}
            </div>
            {arrival && fresh.has(arrival.proposal_id) ? (
              <button
                type="button"
                onClick={() => {
                  setView("open");
                  select(arrival.proposal_id);
                }}
                className="block w-full animate-ink-in border-b border-ink bg-ink px-3 py-2 text-left text-dense text-on-dark hover:bg-wash"
              >
                <span className="font-medium">Yeni onay talebi · {arrival.ticker}</span>
                <span className="block text-meta opacity-85">Graf interrupt() ile durdu — kararınızı bekliyor</span>
              </button>
            ) : null}
            {list.length ? (
              <QueueList cards={list} selectedId={current?.proposal_id ?? null} fresh={fresh} nowMs={nowMs} onSelect={select} />
            ) : (
              <p className="px-3 py-6 text-dense text-muted">{view === "open" ? "Bekleyen onay yok." : "Bugün karara bağlanan öneri yok."}</p>
            )}
            <p className="flex items-center gap-1.5 border-t border-hairline px-3 py-2 text-meta text-muted">
              <Kbd>j</Kbd>
              <Kbd>k</Kbd> öneriler arasında gezin
            </p>
          </aside>

          <div ref={detailRef} className="min-w-0 scroll-mt-28">
            {current && status && gate ? (
              <ApprovalCardView
                key={current.proposal_id}
                card={current}
                status={status}
                nowMs={nowMs}
                gate={gate}
                explain={explain}
                explainLoading={Boolean(decidedRun) && ex.refreshing}
                onDecide={(k) => {
                  decide.reset();
                  setDialog(k);
                }}
              />
            ) : (
              <div className="border-[1.5px] border-ink bg-panel">
                <EmptyState title="Bir öneri seçin" body="Soldaki kuyruktan bir kart seçtiğinizde ayrıntısı burada açılır." />
              </div>
            )}
          </div>
        </div>
      )}

      {current ? (
        <DecisionDialog card={current} kind={dialog} onClose={() => setDialog(null)} onSubmit={(d) => void submit(d)} pending={decide.pending} error={decide.error} />
      ) : null}
    </div>
  );
}

function LoadingLayout() {
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]" role="status" aria-label="Onay kuyruğu yükleniyor">
      <div className="space-y-3 border-[1.5px] border-ink bg-panel p-3">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonLines key={i} lines={2} />
        ))}
      </div>
      <div className="space-y-4 border-[1.5px] border-ink bg-panel p-5">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
