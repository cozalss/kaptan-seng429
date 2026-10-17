"use client";

import type { Ref } from "react";
import type { RiskStatus } from "@/lib/domain";
import { actorName } from "@/lib/actors";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";
import { TwoStep } from "./kit";
import type { Ask } from "./stop-copy";

/**
 * The desk while it is stopped: who stopped it, when and why, then the restart as a two-step
 * status (1/2 Yönetici starts, 2/2 Risk Sorumlusu confirms) and the one button for the next step.
 */
export function Stopped({
  risk,
  onStart,
  onConfirm,
  justChanged,
  statusRef,
}: {
  risk: RiskStatus;
  onStart: () => void;
  onConfirm: () => void;
  justChanged: Ask | null;
  statusRef: Ref<HTMLDivElement>;
}) {
  const { can } = useRole();
  const started = risk.reset?.started ?? null;
  const meta = [actorName(risk.kill_by), risk.kill_at ? fmtTime(risk.kill_at) : null].filter((part): part is string => part !== null).join(" · ");
  return (
    <div className="space-y-5" data-testid="stop-state">
      <div ref={statusRef} role="status" tabIndex={-1} className="space-y-1 outline-none">
        <p className={cn("text-ui text-ink", justChanged === "stop" && "animate-fade-in")}>
          <span className="font-semibold text-north">Durduruldu.</span> Yeni emir çıkmıyor; elindekiler satılmadı.
        </p>
        <p className="text-dense text-muted tabular-nums">
          {meta}
          {risk.kill_reason ? <> · “{risk.kill_reason}”</> : null}
        </p>
        <p className="sr-only">
          {started ? "Birinci imza atıldı; şimdi Risk Sorumlusunun onayı bekleniyor." : "Yeniden açmak için önce Yönetici imzalar."}
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-ui font-medium text-ink">Yeniden başlatmak iki kişi ister: Yönetici başlatır, Risk Sorumlusu onaylar.</p>
        <TwoStep
          label="Yeniden başlatma imzaları"
          fresh={justChanged === "start" ? 1 : null}
          steps={[
            { label: "Yönetici başlatır", sig: started, waiting: started === null, testId: "reset-stamp-1" },
            { label: "Risk Sorumlusu onaylar", sig: null, waiting: started !== null, testId: "reset-stamp-2" },
          ]}
        />
      </div>

      {started === null ? (
        <div className="space-y-2">
          <Button variant="primary" disabled={!can("kill.reset_start")} locked={!can("kill.reset_start")} onClick={onStart}>
            Yeniden başlatmayı başlat
          </Button>
          <Denied action="kill.reset_start" />
        </div>
      ) : (
        <div className="space-y-2">
          <Button variant="primary" disabled={!can("kill.reset_confirm")} locked={!can("kill.reset_confirm")} onClick={onConfirm}>
            Onayla ve yeniden başlat
          </Button>
          <Denied action="kill.reset_confirm" />
        </div>
      )}
    </div>
  );
}
