"use client";

import { useState } from "react";
import { IS_MOCK } from "@/lib/api/config";
import { useApiQuery } from "@/lib/api/react";
import { can, deniedHint } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/session-context";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDesk } from "@/components/shell/desk-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HashChip } from "@/components/ui/data";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { ErrorState, SkeletonLines } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import { liveKeys, liveVerdict } from "./admin-logic";
import { useAction } from "./use-action";

/** Read-only config labels (04 §12: "config (salt okunur sürüm etiketi)"). */
export function ConfigPanel() {
  const q = useApiQuery((a) => a.adminConfig(), []);
  const c = q.data;
  return (
    <Panel aria-labelledby="config-title">
      <PanelHeader id="config-title" title="Config · salt okunur" meta="Sürüm etiketleri dondurulmuştur; değişiklik iki onaylı PR ile yeni strategy_version demektir." />
      {q.error ? (
        <div className="p-4">
          <ErrorState message={q.error} onRetry={() => void q.refetch()} />
        </div>
      ) : !c ? (
        <div className="p-4">
          <SkeletonLines lines={6} />
        </div>
      ) : (
        <div className="grid gap-0 md:grid-cols-2">
          <dl className="divide-y divide-hairline border-hairline md:border-r">
            {[
              ["Yürütme modu", <Badge key="m" tone="ink">{c.execution_mode === "paper" ? "paper · SimBIST" : c.execution_mode}</Badge>],
              ["Kurallar", <span key="r" className="code">{c.rules_version}</span>],
              ["rules_hash", <HashChip key="h" hash={c.rules_hash} />],
              ["prompt_manifest_hash", <HashChip key="p" hash={c.prompt_manifest_hash} />],
              ["config_hash", <HashChip key="c" hash={c.config_hash} />],
              ["KAP yoklama", `${c.kap_poll_seconds} sn (seans içi, en az 30)`],
              ["Onay süresi", c.approval_deadline_tr],
              ["Demo modu", c.demo_mode ? "açık · enjeksiyon yalnızca Admin" : "kapalı"],
            ].map(([k, v]) => (
              <div key={String(k)} className="grid grid-cols-[150px_1fr] items-center gap-3 px-4 py-2.5 text-dense">
                <dt className="text-muted">{k}</dt>
                <dd className="min-w-0 text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="divide-y divide-hairline">
            <section className="px-4 py-3">
              <h3 className="text-meta text-muted">Strateji sürümleri (ileri dönük test)</h3>
              <ul className="mt-2 space-y-2">
                {c.strategy_versions.map((s) => (
                  <li key={s.id} className="flex items-baseline gap-3 text-dense">
                    <span className="code w-16 font-medium text-ink">{s.id}</span>
                    <span className="min-w-0 flex-1 text-ink-soft">
                      {s.scope_tr} <span className="text-muted">· {fmtDateTime(s.frozen_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="px-4 py-3">
              <h3 className="text-meta text-muted">Modeller (tam sürüm kimliğiyle dondurulur)</h3>
              <ul className="mt-2 space-y-1.5">
                {c.models.map((m) => (
                  <li key={m.model_id} className="flex flex-wrap items-baseline gap-x-3 text-dense">
                    <span className="code text-ink">{m.model_id}</span>
                    <span className="text-muted">{m.role_tr}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Live mode, three independent keys (09 §8). In mock mode it is always off and says why. */
export function LivePanel() {
  const user = useSession();
  const { risk } = useDesk();
  const q = useApiQuery((a) => a.liveArm(), []);
  const arm = useAction();
  const [open, setOpen] = useState(false);
  const killOn = risk?.kill_switch === "on";
  const s = q.data;
  const verdict = s ? liveVerdict(s, { isMock: IS_MOCK, killOn }) : null;
  const canInit = can(user.role, "live_arm_init");
  const armBlocked = IS_MOCK ? "Mock/demo modunda canlı mod başlatılamaz." : killOn ? "Kill switch açıkken silahlandırılamaz." : !canInit ? deniedHint("live_arm_init") : null;

  return (
    <Panel aria-labelledby="live-title" tone={verdict?.armed ? "critical" : "panel"}>
      <PanelHeader id="live-title" title="Canlı mod · üç anahtar" meta="Canlı = gerçek para için emir/fiş üretimi. Üçü birden açık değilse adaptör paper'a düşer ve audit'e yazılır." />
      {q.error ? (
        <div className="p-4">
          <ErrorState message={q.error} onRetry={() => void q.refetch()} />
        </div>
      ) : !s || !verdict ? (
        <div className="p-4">
          <SkeletonLines lines={4} />
        </div>
      ) : (
        <div className="space-y-5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-4">
            <span
              role="switch"
              aria-checked={verdict.armed}
              aria-disabled
              aria-label="Canlı mod"
              className={cn("relative inline-flex h-9 w-[72px] shrink-0 items-center border-[1.5px] border-ink", verdict.armed ? "bg-north" : "bg-sunk")}
            >
              <span aria-hidden className={cn("absolute top-[3px] size-[26px] border-[1.5px] border-ink bg-panel", verdict.armed ? "right-[3px]" : "left-[3px]")} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("font-display text-[30px] leading-none", verdict.armed ? "text-north" : "text-ink")}>Canlı mod {verdict.armed ? "AÇIK" : "KAPALI"}</p>
              <p className="mt-1.5 max-w-prose text-dense text-ink-soft">{verdict.reason}</p>
            </div>
          </div>
          <ol className="grid border-[1.5px] border-ink md:grid-cols-3">
            {liveKeys(s).map((k, i) => (
              <li key={k.id} className={cn("px-3 py-3", i > 0 && "border-t border-hairline md:border-t-0 md:border-l")}>
                <div className="flex items-center gap-2">
                  <span className="code text-muted">{k.id}</span>
                  <span className="text-dense font-medium text-ink">{k.title}</span>
                  <Badge tone={k.on ? "ink" : "muted"} className="ml-auto">
                    {k.on ? "açık" : "kapalı"}
                  </Badge>
                </div>
                <p className="code mt-1.5 text-meta text-ink-soft">{k.where}</p>
                <p className="mt-1 text-meta text-muted">{k.detail}</p>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" disabled={Boolean(armBlocked) || Boolean(s.ui_armed_by)} onClick={() => setOpen(true)}>
              K3: canlı modu başlat (1/2)
            </Button>
            <span className="text-meta text-muted">{armBlocked ?? (s.ui_armed_by ? "Başlatıldı; Risk Officer onayı bekleniyor." : "TOTP gerekir; 18:30'da kendiliğinden düşer.")}</span>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="critical"
        title="Canlı modu başlat (K3 1/2)"
        description="Risk Officer onaylamadan ve K1, K2 açık olmadan canlı mod açılmaz. Her emirde yine insan onayı gerekir."
        phrase="CANLI"
        confirmLabel="Başlat"
        requireTotp
        pending={arm.pending}
        error={arm.error}
        onConfirm={async ({ totp }) => {
          const r = await arm.run((api) => api.armLive(totp));
          if (!r.ok) return;
          setOpen(false);
          notify.info("Canlı mod başlatıldı (1/2)", "Risk Officer onayı bekleniyor.");
          await q.refetch();
        }}
      />
    </Panel>
  );
}
