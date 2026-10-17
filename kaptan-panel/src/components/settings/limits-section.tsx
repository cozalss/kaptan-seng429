"use client";

import type { LimitsView, LimitVersion, Signature } from "@/lib/domain";
import { ROLE_LABEL } from "@/lib/domain/user";
import { useApiMutation, useApiQuery } from "@/lib/api/react";
import { fmtDate, fmtTime } from "@/lib/format";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SkeletonLines } from "@/components/ui/primitives";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";
import { SECTION, SectionHead } from "./section-nav";
import { changedKey, historyLine, limitSentence, PLAIN_LIMITS, valueOf } from "./limits-logic";
import { ProposeLimit } from "./limits-propose";

/**
 * Sınırlar — the canonical limits as plain sentences. A change takes two signatures: the
 * Yönetici proposes with a reason (1/2), the Risk Sorumlusu approves (2/2). Short history.
 */
export function LimitsSection() {
  const q = useApiQuery((api) => api.limits(), []);
  useEventStream("desk", { "limits.changed": () => void q.refetch() });
  const view = q.data;

  return (
    <section aria-labelledby="sinirlar-baslik" id="sinirlar" {...SECTION}>
      <SectionHead id="sinirlar-baslik" title="Sınırlar">
        Kuralların dayandığı sabitler. Değiştirmek iki imza ister: Yönetici önerir, Risk Sorumlusu onaylar. Sınırlar panelden yalnızca sıkılaştırılabilir; gevşetmek riski büyütür.
      </SectionHead>
      {view ? (
        <>
          <ActiveLimits version={view.active} />
          {view.pending ? <Pending view={view} onDone={() => void q.refetch()} /> : <ProposeLimit view={view} onDone={() => void q.refetch()} />}
          <History versions={view.history} />
        </>
      ) : (
        <SkeletonLines lines={5} />
      )}
    </section>
  );
}

function ActiveLimits({ version }: { version: LimitVersion }) {
  return (
    <div>
      <p className="mb-2 text-dense text-muted">
        Yürürlükte: sürüm {version.version} · {fmtDate(version.effective_from ?? version.created_at)}
      </p>
      <ul aria-label="Geçerli sınırlar" className="divide-y divide-hairline border-y border-hairline">
        {PLAIN_LIMITS.map((key) => {
          const v = valueOf(version.values, key);
          return v === null ? null : (
            <li key={key} className="py-2.5 text-[16px] leading-[24px] text-ink">
              {limitSentence(key, v)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Sig({ n, label, sig, waiting, yours = false }: { n: 1 | 2; label: string; sig: Signature | null; waiting: boolean; yours?: boolean }) {
  return (
    <li data-testid={`limit-stamp-${n}`} className={cn("flex items-start gap-3 border-[1.5px] px-3.5 py-3", sig ? "border-ink bg-panel shadow-ink" : "border-dashed border-rule-soft")}>
      <span aria-hidden className={cn("mt-[1px] grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] text-[12px] font-medium", sig ? "border-ink bg-ink text-on-dark" : "border-wash text-wash")}>
        {sig ? "✓" : n}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-ink">
          {label} <span className="font-normal text-muted">· {n}/2</span>
        </span>
        <span className="mt-0.5 block text-[13px] text-muted">{sig ? `${sig.name} · ${ROLE_LABEL[sig.role]} · ${fmtTime(sig.at)}` : waiting ? (yours ? "imza bekleniyor · sıra sende" : "imza bekleniyor") : "—"}</span>
        {sig?.reason ? <span className="mt-1 block text-[14px] leading-[20px] text-ink-soft">“{sig.reason}”</span> : null}
      </span>
    </li>
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
    <div className="space-y-4 border-[1.5px] border-ink bg-panel px-5 py-5" data-testid="limit-pending">
      <p className="label">Bekleyen değişiklik · 1/2 imza</p>
      {key && before !== null && after !== null ? (
        <div className="space-y-1 text-[16px] leading-[24px]">
          <p className="text-muted line-through decoration-rule-soft">{limitSentence(key, before)}</p>
          <p className="text-ink">{limitSentence(key, after)}</p>
        </div>
      ) : null}
      <ol aria-label="Sınır değişikliği imzaları" className="grid gap-3 sm:grid-cols-2">
        <Sig n={1} label="Yönetici önerdi" sig={pending.proposed_by} waiting={false} />
        <Sig n={2} label="Risk Sorumlusu onaylar" sig={null} waiting yours={allowed} />
      </ol>
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
        <p role="alert" className="text-[14px] text-north">
          {decide.error}
        </p>
      ) : null}
    </div>
  );
}

function History({ versions }: { versions: LimitVersion[] }) {
  return (
    <div>
      <h3 className="mb-2 text-dense text-muted">Sürümler</h3>
      <ol aria-label="Sınır sürümleri" className="divide-y divide-hairline border-y border-hairline">
        {versions.slice(0, 5).map((v) => (
          <li key={v.version} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2.5 text-dense text-ink-soft">
            <span className="font-medium text-ink">Sürüm {v.version}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{historyLine(v)}</span>
            {v.status === "active" ? <span className="text-meta text-muted underline decoration-dotted underline-offset-[3px]">yürürlükte</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
