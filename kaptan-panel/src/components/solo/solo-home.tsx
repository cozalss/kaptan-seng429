"use client";

import { useMemo, useState } from "react";
import { useApi, useApiMutation, useApiQuery } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { useOptionalSession } from "@/lib/auth/session-context";
import { recentActivity } from "@/lib/solo/activity";
import { useHolds } from "@/lib/solo/holds";
import type { Suggestion } from "@/lib/solo/overview";
import { soloRights, type SoloRights } from "@/lib/solo/rights";
import { approvedSentence, skippedSentence, titleTr } from "@/lib/solo/words";
import { ErrorState, Skeleton } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import { Activity } from "./activity";
import { AllocationPanel } from "./allocation";
import { MoneyHero } from "./money-hero";
import { useSingleUser } from "./solo-mode";
import { SOLO_RESTART_REASON, SOLO_STOP_REASON, StopCard, StoppedBanner } from "./stop-panel";
import { Suggestions, type Answer, type OrderFigures } from "./suggestions";

/** The note a "Geç" leaves on the proposal (the backend may ask for a reason on a rejection). */
const SKIP_COMMENT = "Benim KAPtan'ım: geçildi.";

/** Single-user mode, or a page rendered on its own: every right (the API still decides). */
const FALLBACK_RIGHTS: SoloRights = soloRights({ singleUser: true, role: "risk_officer", uid: "", reset: null });

/**
 * "Benim KAPtan'ım": one calm screen for one person. How much money there is and how it moved,
 * what KAPtan suggests (Onayla / Geç), where the money sits, what happened lately, and one stop
 * button. On a team desk it is the signed-in member's personal view: the same desk, their rights.
 * Phone order: money → suggestions → where it sits → activity → stop.
 */
export function SoloHome() {
  const q = useApiQuery(async (api) => {
    const [overview, risk, approvals, positions] = await Promise.all([api.overview(), api.riskStatus(), api.listApprovals("all"), api.positions()]);
    return { overview, risk, approvals, positions };
  });
  const session = useOptionalSession();
  const singleUser = useSingleUser();
  const { holds, addHold } = useHolds();
  const [busy, setBusy] = useState<{ id: string; answer: Answer } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const api = useApi();
  const stop = useApiMutation((api) => api.killSwitch(SOLO_STOP_REASON));
  const restart = useApiMutation(async (api, step: "both" | "start" | "confirm") => {
    if (step === "start") return api.startKillReset({ reason: SOLO_RESTART_REASON });
    // Single-user mode: the same person starts (1/2) and confirms (2/2); the backend audits the waiver.
    if (step === "both" && !q.data?.risk.reset?.started) await api.startKillReset({ reason: SOLO_RESTART_REASON });
    return api.confirmKillReset({ reason: SOLO_RESTART_REASON });
  });

  const data = q.data;
  const names = useMemo(
    () =>
      new Map([
        ...(data?.approvals ?? []).map((c) => [c.ticker, titleTr(c.company_name)] as const),
        ...(data?.overview.allocations ?? []).map((a) => [a.symbol, titleTr(a.name)] as const),
      ]),
    [data],
  );
  const held = useMemo(() => new Map((data?.overview.allocations ?? []).map((a) => [a.symbol, a.amount])), [data]);
  const figures = useMemo(
    () => new Map<string, OrderFigures>((data?.approvals ?? []).map((c) => [c.proposal_id, { amount: c.final_notional_try, qty: c.qty, limit: c.limit_price }])),
    [data],
  );
  const suggestions = useMemo(() => {
    const done = new Set(holds.map((h) => h.id));
    return (data?.overview.open_suggestions ?? []).filter((s) => !done.has(s.id));
  }, [data, holds]);
  const voice = session && !singleUser ? "desk" : "you";
  const activity = useMemo(() => (data ? recentActivity(data.approvals, data.positions, holds, undefined, voice) : []), [data, holds, voice]);

  if (q.loading && !data) return <HomeSkeleton />;
  if (!data) return <ErrorState message={q.error ?? "Bilgiler alınamadı."} onRetry={() => void q.refetch()} />;

  const rights = session && !singleUser ? soloRights({ singleUser, role: session.role, uid: session.uid, reset: data.risk.reset }) : FALLBACK_RIGHTS;
  const stopped = data.risk.kill_switch === "on";
  const started = data.risk.reset?.started ?? null;

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
    if (!rights.restart) return false;
    const r = await restart.run(rights.restart);
    if (!r) return false;
    notify.success(rights.restart === "start" ? "Yeniden başlatma istendi; ikinci onay bekleniyor." : "İşlemler yeniden başladı.");
    await q.refetch();
    return true;
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {q.error ? <ErrorState message={q.error} onRetry={() => void q.refetch()} /> : null}
      {stopped ? (
        <StoppedBanner
          stoppedAt={data.risk.kill_at ?? data.risk.as_of}
          requestedBy={rights.restart === "confirm" && started ? started.name : null}
          rights={rights}
          pending={restart.pending}
          error={restart.error}
          onRestart={onRestart}
        />
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:gap-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:items-start">
        <div className="min-w-0 space-y-6 sm:space-y-8">
          <MoneyHero overview={data.overview} todayPct={data.risk.daily_pnl_pct} />
          <Suggestions
            suggestions={suggestions}
            names={names}
            figures={figures}
            held={held}
            stopped={stopped}
            busy={busy}
            errors={errors}
            rights={rights}
            onAnswer={(s, a) => void onAnswer(s, a)}
          />
        </div>
        <div className="min-w-0 space-y-6 sm:space-y-8">
          <AllocationPanel allocations={data.overview.allocations} cash={data.overview.cash} total={data.overview.equity_now} />
          <Activity items={activity} />
          {stopped ? null : <StopCard rights={rights} pending={stop.pending} error={stop.error} onStop={onStop} />}
        </div>
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div role="status" aria-label="Yükleniyor" className="grid gap-8 lg:grid-cols-[8fr_4fr]">
      <div className="space-y-8">
        <Skeleton className="h-[460px] w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
      <div className="space-y-8">
        <Skeleton className="h-80 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    </div>
  );
}
