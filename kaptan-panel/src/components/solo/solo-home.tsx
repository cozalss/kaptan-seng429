"use client";

import { useMemo, useState } from "react";
import { useApi, useApiMutation, useApiQuery } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { recentActivity } from "@/lib/solo/activity";
import { useHolds } from "@/lib/solo/holds";
import type { Suggestion } from "@/lib/solo/overview";
import { approvedSentence, skippedSentence, titleTr } from "@/lib/solo/words";
import { ErrorState, Skeleton } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import { Activity } from "./activity";
import { AllocationPanel } from "./allocation";
import { Headline } from "./headline";
import { MoneyChart } from "./money-chart";
import { SOLO_RESTART_REASON, SOLO_STOP_REASON, StopPanel } from "./stop-panel";
import { Suggestions, type Answer } from "./suggestions";

/** The note a "Geç" leaves on the proposal (the backend may ask for a reason on a rejection). */
const SKIP_COMMENT = "Benim KAPtan'ım: geçildi.";

/**
 * "Benim KAPtan'ım": one calm screen for one person. How much money there is and how it moved,
 * where it sits, what KAPtan suggests (Onayla / Geç), what happened lately, and one stop button.
 */
export function SoloHome() {
  const q = useApiQuery(async (api) => {
    const [overview, risk, approvals, positions] = await Promise.all([api.overview(), api.riskStatus(), api.listApprovals("all"), api.positions()]);
    return { overview, risk, approvals, positions };
  });
  const { holds, addHold } = useHolds();
  const [busy, setBusy] = useState<{ id: string; answer: Answer } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const api = useApi();
  const stop = useApiMutation((api) => api.killSwitch(SOLO_STOP_REASON));
  // Single-user mode: the same person starts (1/2) and confirms (2/2) the restart; the backend audits the waiver.
  const restart = useApiMutation(async (api, alreadyStarted: boolean) => {
    if (!alreadyStarted) await api.startKillReset({ reason: SOLO_RESTART_REASON });
    return api.confirmKillReset({ reason: SOLO_RESTART_REASON });
  });

  const data = q.data;
  const names = useMemo(() => new Map((data?.overview.allocations ?? []).map((a) => [a.symbol, titleTr(a.name)])), [data]);
  const suggestions = useMemo(() => {
    const held = new Set(holds.map((h) => h.id));
    return (data?.overview.open_suggestions ?? []).filter((s) => !held.has(s.id));
  }, [data, holds]);
  const activity = useMemo(() => (data ? recentActivity(data.approvals, data.positions, holds) : []), [data, holds]);

  if (q.loading && !data) return <HomeSkeleton />;
  if (!data) return <ErrorState message={q.error ?? "Bilgiler alınamadı."} onRetry={() => void q.refetch()} />;

  const stopped = data.risk.kill_switch === "on";
  /** "Tut" / "Geç" on a TUT card: the backend records it (the card stays open there), this device hides it. */
  const answerHold = async (s: Suggestion, answer: Answer) => {
    const kind = answer === "approve" ? "held" : "skipped";
    const done = await api.holdSuggestion(s.id, { kind });
    addHold({ id: s.id, symbol: s.symbol, at: done.at, answer: kind });
    notify.success(answer === "approve" ? approvedSentence("tut", s.symbol) : skippedSentence(s.symbol));
  };
  const answerApproval = async (s: Suggestion, answer: Answer) => {
    await api.decideApproval(s.id, { decision: answer === "approve" ? "approve" : "reject", approved_notional_try: null, comment: answer === "skip" ? SKIP_COMMENT : "" });
    notify.success(answer === "approve" ? approvedSentence(s.action, s.symbol) : skippedSentence(s.symbol));
    await q.refetch();
  };
  const onAnswer = async (s: Suggestion, answer: Answer) => {
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== s.id)));
    setBusy({ id: s.id, answer });
    try {
      await (s.action === "tut" ? answerHold(s, answer) : answerApproval(s, answer));
    } catch (e) {
      setErrors((prev) => ({ ...prev, [s.id]: errorMessage(e) }));
    } finally {
      setBusy(null);
    }
  };
  const onStop = async () => {
    const r = await stop.run();
    if (!r) return false;
    notify.success("Tüm işlemler durduruldu.");
    await q.refetch();
    return true;
  };
  const onRestart = async () => {
    const r = await restart.run(Boolean(data.risk.reset?.started));
    if (!r) return false;
    notify.success("İşlemler yeniden başladı.");
    await q.refetch();
    return true;
  };

  return (
    <div className="space-y-10 sm:space-y-14">
      {q.error ? <ErrorState message={q.error} onRetry={() => void q.refetch()} /> : null}
      <div className="space-y-8 sm:space-y-10">
        <Headline overview={data.overview} />
        <MoneyChart series={data.overview.equity_series} capitalStart={data.overview.capital_start} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-12">
        <div className="min-w-0 space-y-12">
          <Suggestions suggestions={suggestions} names={names} stopped={stopped} busy={busy} errors={errors} onAnswer={(s, a) => void onAnswer(s, a)} />
          <Activity items={activity} />
        </div>
        <div className="min-w-0 space-y-8">
          <AllocationPanel allocations={data.overview.allocations} cash={data.overview.cash} total={data.overview.equity_now} />
          <StopPanel
            stoppedAt={stopped ? (data.risk.kill_at ?? data.risk.as_of) : null}
            pending={stop.pending || restart.pending}
            error={stopped ? restart.error : stop.error}
            onStop={onStop}
            onRestart={onRestart}
          />
        </div>
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div role="status" aria-label="Yükleniyor" className="space-y-10">
      <div className="grid gap-8 lg:grid-cols-[5fr_7fr]">
        <div className="space-y-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-16 w-72" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-[300px] w-full" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[7fr_5fr]">
        <div className="space-y-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}
