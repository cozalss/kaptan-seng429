"use client";

import type { LimitsView, LimitVersion } from "@/lib/domain";
import { useApiMutation, useApiQuery } from "@/lib/api/react";
import { fmtDate } from "@/lib/format";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SkeletonLines } from "@/components/ui/primitives";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";
import { CARD, CARD_PAD, Pill, SectionTitle, TwoStep } from "@/components/portfolio/kit";
import { changedKey, historyLine, limitSentence, PLAIN_LIMITS, valueOf } from "./limits-logic";
import { ProposeLimit } from "./limits-propose";

/**
 * Sınırlar — the limits in force as plain sentences. A change takes two signatures: the
 * Yönetici proposes with a reason (1/2), the Risk Sorumlusu approves (2/2). Short history.
 */
export function LimitsSection() {
  const q = useApiQuery((api) => api.limits(), []);
  useEventStream("desk", { "limits.changed": () => void q.refetch() });
  const view = q.data;

  return (
    <section aria-labelledby="sinirlar-baslik" id="sinirlar" className="space-y-6">
      {/* A change waiting for its second signature is the one thing to act on: it comes first. */}
      {view?.pending ? <Pending view={view} onDone={() => void q.refetch()} /> : null}
      <div className={CARD}>
        <div className="flex flex-col gap-2 px-4 pt-4 pb-3 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:pt-5">
          <SectionTitle id="sinirlar-baslik" title="Sınırlar">
            Değiştirmek iki imza ister: Yönetici önerir, Risk Sorumlusu onaylar.
          </SectionTitle>
          {view ? (
            <p className="shrink-0 text-dense text-muted tabular-nums sm:pt-1">
              Sürüm {view.active.version} · {fmtDate(view.active.effective_from ?? view.active.created_at)}
            </p>
          ) : null}
        </div>
        {view ? <ActiveLimits version={view.active} /> : <SkeletonLines lines={5} className="px-4 pb-5 sm:px-6" />}
      </div>
      {view ? (
        <>
          {view.pending ? null : <ProposeLimit view={view} onDone={() => void q.refetch()} />}
          <History versions={view.history} />
        </>
      ) : null}
    </section>
  );
}

function ActiveLimits({ version }: { version: LimitVersion }) {
  return (
    <ul aria-label="Geçerli sınırlar" className="divide-y divide-hairline border-t-2 border-hairline">
      {PLAIN_LIMITS.map((key) => {
        const v = valueOf(version.values, key);
        return v === null ? null : (
          <li key={key} className="px-4 py-3 text-ui text-ink sm:px-6">
            {limitSentence(key, v)}
          </li>
        );
      })}
    </ul>
  );
}

function Pending({ view, onDone }: { view: LimitsView; onDone: () => void }) {
  const { can } = useRole();
  const pending = view.pending as LimitVersion;
  const allowed = can("limits.decide");
  const key = changedKey(pending, view.active);
  const decide = useApiMutation((api, decision: "approve" | "reject") => api.decideLimit(pending.version, { decision, comment: "" }));
  const run = async (d: "approve" | "reject") => {
    const r = await decide.run(d);
    if (r) onDone();
  };
  const before = key ? valueOf(view.active.values, key) : null;
  const after = key ? valueOf(pending.values, key) : null;

  return (
    <div className={cn(CARD, CARD_PAD, "space-y-4 border-brand")} data-testid="limit-pending">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[18px] leading-7 font-semibold text-ink">Bekleyen değişiklik</h3>
        <Pill tone="brand">1/2 imza</Pill>
      </div>
      {key && before !== null && after !== null ? (
        <div className="space-y-1 text-ui">
          <p className="text-muted line-through decoration-rule-soft">{limitSentence(key, before)}</p>
          <p className="font-medium text-ink">{limitSentence(key, after)}</p>
        </div>
      ) : null}
      <TwoStep
        label="Sınır değişikliği imzaları"
        steps={[
          { label: "Yönetici önerdi", sig: pending.proposed_by, waiting: false, testId: "limit-stamp-1" },
          { label: "Risk Sorumlusu onaylar", sig: null, waiting: true, testId: "limit-stamp-2", waitingText: allowed ? "imza bekleniyor · sıra sende" : "imza bekleniyor" },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" locked={!allowed} pending={decide.pending} disabled={!allowed || decide.pending} onClick={() => void run("approve")}>
          {decide.pending ? "Kaydediliyor…" : "Onayla (2/2)"}
        </Button>
        <Button variant="ghost" disabled={!allowed || decide.pending} onClick={() => void run("reject")}>
          Reddet
        </Button>
      </div>
      <Denied action="limits.decide" />
      {decide.error ? (
        <p role="alert" className="text-dense text-north">
          {decide.error}
        </p>
      ) : null}
    </div>
  );
}

function History({ versions }: { versions: LimitVersion[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-ui font-semibold text-ink">Sürümler</h3>
      <ol aria-label="Sınır sürümleri" className={cn(CARD, "divide-y divide-hairline")}>
        {versions.slice(0, 5).map((v) => (
          <li key={v.version} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-dense text-ink-soft sm:px-6">
            <span className="font-semibold text-ink">Sürüm {v.version}</span>
            <span className="tabular-nums">{historyLine(v)}</span>
            {v.status === "active" ? <span className="text-meta font-semibold text-gain">yürürlükte</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
