"use client";

import { useState } from "react";
import type { LimitVersion } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Dialog, DialogContent, Tooltip } from "@/components/ui/overlay";
import { RequiredComment, validateComment } from "@/components/ui/field";
import { changedCount, diffLimits, type FourEyes } from "./limits-logic";
import { LimitDiff } from "./limit-tables";

/** Two seals: 1/2 proposed (who, when) → 2/2 second approval (pending or done). */
export function FourEyesSeals({ v }: { v: LimitVersion }) {
  const second = v.approved_by_name;
  return (
    <ol aria-label="Dört göz onayı" className="grid grid-cols-2 border-[1.5px] border-ink">
      <li className="border-r border-ink px-3 py-2.5">
        <span className="text-meta text-muted">1/2 · Öneren</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-dense font-medium text-ink">
          <span aria-hidden className="grid size-[18px] place-items-center border border-ink bg-ink text-[12px] text-on-dark">
            ✓
          </span>
          {v.created_by_name}
        </span>
        <span className="mt-0.5 block text-meta text-muted tabular-nums">{fmtDateTime(v.created_at)}</span>
      </li>
      <li className={cn("px-3 py-2.5", !second && "bg-paper")}>
        <span className="text-meta text-muted">2/2 · İkinci onay</span>
        {second ? (
          <span className="mt-0.5 flex items-center gap-1.5 text-dense font-medium text-ink">
            <span aria-hidden className="grid size-[18px] place-items-center border border-ink bg-ink text-[12px] text-on-dark">
              ✓
            </span>
            {second}
          </span>
        ) : (
          <span className="mt-0.5 flex items-center gap-1.5 text-dense text-ink-soft">
            <span aria-hidden className="size-[18px] border border-dashed border-rule-soft" />
            Farklı bir kullanıcı bekleniyor
          </span>
        )}
        <span className="mt-0.5 block text-meta text-muted">Risk Officer ya da Admin · öneren hariç</span>
      </li>
    </ol>
  );
}

export function PendingProposal({
  proposal,
  baseline,
  gate,
  pending,
  error,
  onDecide,
}: {
  proposal: LimitVersion;
  baseline: LimitVersion | undefined;
  gate: FourEyes;
  pending: boolean;
  error: string | null;
  onDecide: (decision: "approve" | "reject", comment: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [comment, setComment] = useState("");
  const [touched, setTouched] = useState(false);
  const rows = diffLimits(baseline?.values ?? [], proposal.values);
  const n = changedCount(rows);
  const commentErr = validateComment(comment);

  const close = () => {
    setMode(null);
    setComment("");
    setTouched(false);
  };

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" disabled={!gate.canDecide} onClick={() => setMode("approve")}>
        Onayla (2/2)
      </Button>
      <Button variant="danger-outline" disabled={!gate.canDecide} onClick={() => setMode("reject")}>
        Reddet
      </Button>
    </div>
  );

  return (
    <Panel raised aria-labelledby="pending-title">
      <header className="flex flex-wrap items-start gap-3 border-b border-hairline px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="text-meta text-muted">Bekleyen öneri</p>
          <h2 id="pending-title" className="font-display text-[28px] leading-tight text-ink">
            v{proposal.version} · {n} limit değişiyor
          </h2>
        </div>
        {gate.canDecide ? (
          actions
        ) : (
          <Tooltip content={gate.reason ?? ""}>
            <span tabIndex={0} className="inline-flex">
              {actions}
            </span>
          </Tooltip>
        )}
      </header>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0 border-hairline lg:border-r">
          <LimitDiff from={baseline?.values ?? []} to={proposal.values} onlyChanged caption={`v${baseline?.version ?? "?"} ile v${proposal.version} arasındaki değişiklikler`} />
        </div>
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div>
            <h3 className="text-meta text-muted">Gerekçe</h3>
            <p className="mt-1 text-ui text-ink">{proposal.reason}</p>
          </div>
          <FourEyesSeals v={proposal} />
          {gate.reason ? (
            <p className="flex items-start gap-2 border-l-[3px] border-ink bg-paper px-3 py-2 text-dense text-ink">
              <span aria-hidden>⊘</span>
              {gate.reason}
            </p>
          ) : null}
          <p className="text-meta text-muted">Karşılaştırma: geçerli sürüm v{baseline?.version ?? "—"}. Onaylanınca yeni sürüm hemen yürürlüğe girer ve audit&#39;e yazılır.</p>
        </div>
      </div>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent
          tone={mode === "reject" ? "critical" : "default"}
          title={mode === "reject" ? `v${proposal.version} önerisini reddet` : `v${proposal.version} önerisini onayla`}
          description={
            mode === "reject"
              ? "Öneri reddedilir; geçerli sürüm değişmez."
              : `İkinci onay sizden. ${n} limit hemen yürürlüğe girer; önceki sürüm "eski" olur.`
          }
        >
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setTouched(true);
              if (commentErr || !mode) return;
              if (await onDecide(mode, comment.trim())) close();
            }}
          >
            <RequiredComment value={comment} onChange={setComment} label="Yorum" error={touched ? commentErr : null} autoFocus />
            {error ? (
              <p role="alert" className="border-l-[3px] border-north bg-north-tint px-3 py-2 text-dense text-north">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>
                Vazgeç
              </Button>
              <Button type="submit" variant={mode === "reject" ? "danger" : "primary"} disabled={pending}>
                {pending ? "İşleniyor…" : mode === "reject" ? "Reddet" : "Onayla ve yürürlüğe al"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
