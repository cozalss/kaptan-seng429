"use client";

import { useState } from "react";
import type { LimitKey, LimitsView, LimitVersion, Signature } from "@/lib/domain";
import { ROLE_LABEL } from "@/lib/domain/user";
import { useApiMutation, useApiQuery } from "@/lib/api/react";
import { fmtDate, fmtTime } from "@/lib/format";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { SkeletonLines } from "@/components/ui/primitives";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";
import { changedKey, fromInput, inputUnit, limitSentence, PLAIN_LIMITS, toInput, valueOf } from "./limits-logic";

/**
 * Sınırlar — the canonical limits as plain sentences. A change takes two signatures: the
 * Yönetici proposes with a reason (1/2), the Risk Sorumlusu approves (2/2). Short history.
 */
export function LimitsSection() {
  const q = useApiQuery((api) => api.limits(), []);
  useEventStream("desk", { "limits.changed": () => void q.refetch() });
  const view = q.data;

  return (
    <section aria-labelledby="sinirlar-baslik" id="sinirlar" className="scroll-mt-28 space-y-6">
      <div className="space-y-2">
        <h2 id="sinirlar-baslik" className="text-[13px] font-medium tracking-[0.04em] text-ink uppercase">
          Sınırlar
        </h2>
        <p className="max-w-[600px] text-[16px] leading-[25px] text-ink-soft">
          Kuralların dayandığı sabitler. Değiştirmek iki imza ister: Yönetici önerir, Risk Sorumlusu onaylar. Sınırlar yalnızca sıkılaştırılabilir.
        </p>
      </div>
      {view ? (
        <>
          <ActiveLimits version={view.active} />
          {view.pending ? <Pending view={view} onDone={() => void q.refetch()} /> : <Propose view={view} onDone={() => void q.refetch()} />}
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
      <p className="mb-2 text-[13px] text-muted">
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

function Sig({ n, label, sig, waiting }: { n: 1 | 2; label: string; sig: Signature | null; waiting: boolean }) {
  return (
    <li data-testid={`limit-stamp-${n}`} className={cn("flex items-start gap-3 border-[1.5px] px-3.5 py-3", sig ? "border-ink bg-panel shadow-ink" : "border-dashed border-rule-soft")}>
      <span aria-hidden className={cn("mt-[1px] grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] text-[12px] font-medium", sig ? "border-ink bg-ink text-on-dark" : "border-wash text-wash")}>
        {sig ? "✓" : n}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-ink">
          {label} <span className="font-normal text-muted">· {n}/2</span>
        </span>
        <span className="mt-0.5 block text-[13px] text-muted">{sig ? `${sig.name} · ${ROLE_LABEL[sig.role]} · ${fmtTime(sig.at)}` : waiting ? "imza bekleniyor" : "—"}</span>
        {sig?.reason ? <span className="mt-1 block text-[14px] leading-[20px] text-ink-soft">“{sig.reason}”</span> : null}
      </span>
    </li>
  );
}

function Pending({ view, onDone }: { view: LimitsView; onDone: () => void }) {
  const { can } = useRole();
  const pending = view.pending as LimitVersion;
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
      <p className="text-[13px] font-medium tracking-[0.04em] text-ink uppercase">Bekleyen değişiklik · 1/2 imza</p>
      {key && before !== null && after !== null ? (
        <div className="space-y-1 text-[16px] leading-[24px]">
          <p className="text-muted line-through decoration-rule-soft">{limitSentence(key, before)}</p>
          <p className="text-ink">{limitSentence(key, after)}</p>
        </div>
      ) : null}
      <ol aria-label="Sınır değişikliği imzaları" className="grid gap-3 sm:grid-cols-2">
        <Sig n={1} label="Yönetici önerdi" sig={pending.proposed_by} waiting={false} />
        <Sig n={2} label="Risk Sorumlusu onaylar" sig={null} waiting />
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!can("limits.decide") || decide.pending} onClick={() => void run("approve")}>
          {decide.pending ? "Kaydediliyor…" : "Onayla (2/2)"}
        </Button>
        <Button variant="ghost" disabled={!can("limits.decide") || decide.pending} onClick={() => void run("reject")}>
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

function Propose({ view, onDone }: { view: LimitsView; onDone: () => void }) {
  const { can } = useRole();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<LimitKey>("risk_per_trade_pct");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const propose = useApiMutation((api, k: LimitKey, v: number, r: string) => api.proposeLimit({ key: k, value: v, reason: r }));
  const parsed = fromInput(key, value);
  const current = valueOf(view.active.values, key);

  const pick = (k: LimitKey) => {
    setKey(k);
    const cur = valueOf(view.active.values, k);
    setValue(cur === null ? "" : toInput(k, cur));
  };

  if (!open) {
    return (
      <div className="space-y-2.5">
        <Button
          variant="secondary"
          disabled={!can("limits.propose")}
          onClick={() => {
            propose.reset();
            pick(key);
            setReason("");
            setOpen(true);
          }}
        >
          Değişiklik öner
        </Button>
        <Denied action="limits.propose" />
      </div>
    );
  }

  return (
    <form
      className="space-y-4 border-[1.5px] border-ink bg-panel px-5 py-5"
      aria-label="Sınır değişikliği öner"
      onSubmit={async (e) => {
        e.preventDefault();
        if (parsed === null) return;
        const r = await propose.run(key, parsed, reason.trim());
        if (r) {
          setOpen(false);
          onDone();
        }
      }}
    >
      <p className="text-[15px] leading-[22px] text-ink-soft">Bu birinci imza (1/2). Değişiklik, Risk Sorumlusu onaylayınca yürürlüğe girer.</p>
      <label className="block space-y-1.5">
        <span className="text-[14px] text-ink-soft">Hangi sınır?</span>
        <select value={key} onChange={(e) => pick(e.target.value as LimitKey)} className="h-10 w-full border-[1.5px] border-ink bg-panel px-3 text-ui text-ink">
          {PLAIN_LIMITS.map((k) => (
            <option key={k} value={k}>
              {limitSentence(k, valueOf(view.active.values, k) ?? 0)}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-[14px] text-ink-soft">Yeni değer ({inputUnit(key)})</span>
        <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="max-w-[180px] tabular-nums" />
      </label>
      {parsed !== null && current !== null && parsed !== current ? <p className="text-[15px] text-ink">Önerilen: {limitSentence(key, parsed)}</p> : null}
      <label className="block space-y-1.5">
        <span className="text-[14px] text-ink-soft">Neden?</span>
        <Textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        <span className="block text-[12px] text-muted">En az 10 harf; denetim defterine yazılır.</span>
      </label>
      {propose.error ? (
        <p role="alert" className="text-[14px] text-north">
          {propose.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={parsed === null || reason.trim().length < 10 || propose.pending}>
          {propose.pending ? "Kaydediliyor…" : "Öner (1/2)"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}

function History({ versions }: { versions: LimitVersion[] }) {
  return (
    <div>
      <h3 className="mb-2 text-[13px] text-muted">Sürümler</h3>
      <ol aria-label="Sınır sürümleri" className="divide-y divide-hairline border-y border-hairline">
        {versions.slice(0, 5).map((v) => (
          <li key={v.version} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-[14px] text-ink-soft">
            <span className="font-medium text-ink">Sürüm {v.version}</span>
            <span>{v.status === "active" ? "yürürlükte" : v.status === "superseded" ? "eskidi" : "reddedildi"}</span>
            <span>
              {v.proposed_by.name} önerdi{v.decided_by ? ` · ${v.decided_by.name} ${v.status === "rejected" ? "reddetti" : "onayladı"}` : ""}
            </span>
            <span className="text-muted">{fmtDate(v.created_at)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
