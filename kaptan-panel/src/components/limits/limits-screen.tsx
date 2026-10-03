"use client";

import { useState } from "react";
import type { LimitValue } from "@/lib/domain";
import { IS_MOCK } from "@/lib/api/config";
import { useApiQuery } from "@/lib/api/react";
import { can, deniedHint } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/session-context";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Tooltip } from "@/components/ui/overlay";
import { EmptyState, ErrorState, PageHeader, SkeletonLines } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import { useAction } from "@/components/admin/use-action";
import { baselineFor, fourEyes } from "./limits-logic";
import { CurrentLimitsTable, LimitDiff, StatusBadge, VersionHistory } from "./limit-tables";
import { PendingProposal } from "./pending-proposal";
import { ProposeDialog } from "./propose-dialog";
import { RestrictedRemovals } from "./restricted-removals";

const selectCls =
  "h-9 border-[1.5px] border-ink bg-panel px-2 text-dense text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

/**
 * /limits (FRONTEND-SPEC §2.8, US-40): the active limits, history with a diff between any
 * two versions, the pending proposal with four-eyes approval, and block-list removals.
 */
export function LimitsScreen() {
  const user = useSession();
  const history = useApiQuery((a) => a.limitsHistory(), []);
  const restricted = useApiQuery((a) => a.restricted(), []);
  useEventStream("desk", { "limits.changed": () => void history.refetch() });

  const canPropose = can(user.role, "limit_propose");
  const canApprove = can(user.role, "limit_approve");
  const [proposeOpen, setProposeOpen] = useState(false);
  const propose = useAction();
  const decide = useAction();

  const versions = history.data ?? [];
  const active = versions.find((v) => v.status === "active");
  const proposal = versions.find((v) => v.status === "proposed");
  const [cmp, setCmp] = useState<{ from: number | null; to: number | null }>({ from: null, to: null });
  const toV = versions.find((v) => v.version === cmp.to) ?? proposal ?? versions[0];
  const fromV = versions.find((v) => v.version === cmp.from) ?? (toV ? (baselineFor(toV, versions) ?? versions.find((v) => v.version !== toV.version)) : undefined);
  const [onlyChanged, setOnlyChanged] = useState(true);

  const proposeBtn = (
    <Button variant="primary" disabled={!canPropose || Boolean(proposal) || !active} onClick={() => setProposeOpen(true)}>
      Değişiklik öner
    </Button>
  );
  const proposeReason = !canPropose ? deniedHint("limit_propose") : proposal ? `v${proposal.version} onay bekliyor; aynı anda tek öneri olabilir.` : null;

  const submitProposal = async (changes: LimitValue[], reason: string) => {
    const r = await propose.run((api) => api.proposeLimits({ changes, reason }));
    if (!r.ok) return false;
    notify.success(`Öneri v${r.value.version} gönderildi (1/2)`, IS_MOCK ? "İkinci onay farklı bir kullanıcıdan gelmeli — rol değiştiriciden geçin." : "İkinci onay farklı bir kullanıcıdan gelmeli.");
    await history.refetch();
    return true;
  };

  const decideProposal = async (decision: "approve" | "reject", comment: string) => {
    if (!proposal) return false;
    const r = await decide.run((api) => api.decideLimits(proposal.version, { decision, comment }));
    if (!r.ok) return false;
    if (decision === "approve") notify.success(`v${proposal.version} yürürlükte (2/2)`, "Önceki sürüm eski olarak işaretlendi; audit'e yazıldı.");
    else notify.info(`v${proposal.version} reddedildi`, "Geçerli sürüm değişmedi.");
    await history.refetch();
    return true;
  };

  if (history.error) {
    return (
      <div className="space-y-6">
        <PageHeader kicker="Denetim · risk kapısı parametreleri" title="Limitler" />
        <ErrorState message={history.error} onRetry={() => void history.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Denetim · risk kapısı parametreleri"
        title="Limitler"
        meta={
          active ? (
            <>
              Geçerli sürüm <b className="font-medium text-ink">v{active.version}</b>
              {active.effective_from ? ` · ${fmtDateTime(active.effective_from)}'den beri` : ""} · öneren {active.created_by_name}, onaylayan {active.approved_by_name}. Her değişiklik iki farklı kişiyle yürürlüğe girer.
            </>
          ) : (
            "Risk kapısının sayısal sınırları. Her değişiklik iki farklı kişiyle yürürlüğe girer."
          )
        }
        actions={
          proposeReason ? (
            <Tooltip content={proposeReason}>
              <span tabIndex={0} className="inline-flex">
                {proposeBtn}
              </span>
            </Tooltip>
          ) : (
            proposeBtn
          )
        }
      />

      {history.loading ? (
        <Panel className="p-4">
          <SkeletonLines lines={10} />
        </Panel>
      ) : (
        <>
          {proposal ? (
            <PendingProposal
              proposal={proposal}
              baseline={baselineFor(proposal, versions)}
              gate={fourEyes(proposal, { uid: user.uid, canApprove, deniedReason: deniedHint("limit_approve") })}
              pending={decide.pending}
              error={decide.error}
              onDecide={decideProposal}
            />
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,1fr)]">
            <Panel aria-labelledby="current-title">
              <PanelHeader
                id="current-title"
                title={active ? `Geçerli sürüm · v${active.version}` : "Geçerli sürüm"}
                meta="Kanonik değerler (06 §9). Risk kapısı her öneride bu sürümü okur."
                actions={active ? <StatusBadge status="active" /> : null}
              />
              {active ? <CurrentLimitsTable values={active.values} /> : <EmptyState title="Geçerli sürüm yok." body="Risk kapısı limitsiz çalışmaz; yönetici ile görüşün." />}
            </Panel>

            <div className="space-y-6">
              <Panel aria-labelledby="history-title">
                <PanelHeader id="history-title" title="Sürüm geçmişi" meta="Bir sürüm seçin: aşağıda bir öncekiyle karşılaştırılır." />
                <VersionHistory versions={versions} selected={toV?.version ?? null} onSelect={(v) => setCmp({ from: null, to: v })} />
              </Panel>
              <RestrictedRemovals
                entries={restricted.data ?? []}
                canConfirm={can(user.role, "blocklist_remove_confirm")}
                deniedReason="Çıkarmayı yalnızca Risk Officer onaylar (Admin talep eder)."
                onChanged={() => void restricted.refetch()}
              />
            </div>
          </div>

          <Panel aria-labelledby="diff-title">
            <header className="flex flex-wrap items-end gap-3 border-b border-hairline px-4 py-3">
              <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                <h2 id="diff-title" className="text-[15px] font-medium text-ink">
                  Sürüm karşılaştırma
                </h2>
                <p className="mt-0.5 text-meta text-muted">Değişen satırlar mürekkeple; gevşeyen limit daha çok risk demektir.</p>
              </div>
              <label className="flex items-center gap-2 text-dense text-ink-soft">
                Eski
                <select className={selectCls} value={fromV?.version ?? ""} onChange={(e) => setCmp({ to: toV?.version ?? null, from: Number(e.target.value) })}>
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      v{v.version}
                    </option>
                  ))}
                </select>
              </label>
              <span aria-hidden className="pb-2 text-muted">
                →
              </span>
              <label className="flex items-center gap-2 text-dense text-ink-soft">
                Yeni
                <select className={selectCls} value={toV?.version ?? ""} onChange={(e) => setCmp({ from: fromV?.version ?? null, to: Number(e.target.value) })}>
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      v{v.version}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex h-9 items-center gap-2 text-dense text-ink-soft">
                <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} className="size-4 accent-[var(--ink)]" />
                Yalnızca değişenler
              </label>
            </header>
            {fromV && toV ? (
              <LimitDiff from={fromV.values} to={toV.values} onlyChanged={onlyChanged} caption={`v${fromV.version} → v${toV.version} karşılaştırması`} />
            ) : (
              <p className="px-4 py-6 text-ui text-muted">Karşılaştırmak için en az iki sürüm gerekir.</p>
            )}
          </Panel>
        </>
      )}

      {active ? (
        <ProposeDialog
          open={proposeOpen}
          onOpenChange={(o) => {
            setProposeOpen(o);
            if (!o) propose.reset();
          }}
          active={active.values}
          activeVersion={active.version}
          pending={propose.pending}
          error={propose.error}
          onSubmit={submitProposal}
        />
      ) : null}
    </div>
  );
}
