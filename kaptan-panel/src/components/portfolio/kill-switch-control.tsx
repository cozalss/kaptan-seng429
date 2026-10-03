"use client";

import { useState } from "react";
import type { RiskStatus } from "@/lib/domain";
import { useApiMutation } from "@/lib/api/react";
import { DEMO_MODE } from "@/lib/api/config";
import { can, deniedHint } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/session-context";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { notify } from "@/components/ui/toast";
import { useDesk } from "@/components/shell/desk-state";
import { actorLabel, KILL_PHRASE, killControl, RESET_CONFIRM_PHRASE, RESET_START_PHRASE } from "./risk-math";

type DialogKind = "engage" | "reset_start" | "reset_confirm" | null;

/** Loss simulation steps × 1.4 s in the mock (11 Adım 4) plus a small margin. */
const LOSS_SIM_MS = 9_000;

/**
 * The kill switch (06 §11, 09 §5, 11 Adım 4). Engage: R or D, type DURDUR + reason.
 * Reset: four-eyes — Admin starts (1/2, TOTP), a different Risk Officer confirms (2/2, TOTP).
 * Disabled controls stay visible with the reason written under them (PANEL-CONTRACT §3.3).
 */
export function KillSwitchControl({ risk }: { risk: RiskStatus }) {
  const user = useSession();
  const { refresh } = useDesk();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [lastReset, setLastReset] = useState<string | null>(null);
  const [simRunning, setSimRunning] = useState(false);

  const engage = useApiMutation((api, reason: string) => api.killSwitch(reason));
  const startReset = useApiMutation((api, reason: string, totp: string) => api.requestKillReset({ reason, totp }));
  const confirmReset = useApiMutation((api, request_id: string, comment: string, totp: string) => api.confirmKillReset({ request_id, comment, totp }));
  const lossSim = useApiMutation((api) => api.injectDemo("loss_simulation"));

  const ctl = killControl(risk, user.role, user.uid);
  const close = () => {
    setDialog(null);
    engage.reset();
    startReset.reset();
    confirmReset.reset();
  };

  const onEngage = async (reason: string) => {
    const r = await engage.run(reason);
    if (!r) return;
    close();
    await refresh();
  };
  const onStartReset = async (reason: string, totp: string) => {
    const r = await startReset.run(reason, totp);
    if (!r) return;
    close();
    notify.info("Sıfırlama başlatıldı (1/2)", "Risk Officer onayı gerekiyor.");
    await refresh();
  };
  const onConfirmReset = async (comment: string, totp: string) => {
    if (ctl.phase !== "reset_pending") return;
    const r = await confirmReset.run(ctl.request.id, comment, totp);
    if (!r) return;
    close();
    setLastReset(r.as_of);
    notify.success("Reset onaylandı (2/2)", "Kill switch kapandı. Günlük durdurma varsa ertesi seansa kadar sürer.");
    await refresh();
  };
  const onLossSim = async () => {
    const r = await lossSim.run();
    if (!r) {
      notify.error("Simülasyon başlatılamadı", lossSim.error ?? undefined);
      return;
    }
    setSimRunning(true);
    setTimeout(() => setSimRunning(false), LOSS_SIM_MS);
  };

  const on = risk.kill_switch === "on";

  return (
    <div className={cn("flex h-full flex-col gap-4 border-[1.5px] p-4", on ? "border-north bg-north text-on-dark" : "border-ink bg-paper")}>
      <div>
        <div className={cn("text-meta", on ? "text-on-dark/85" : "text-muted")}>Kill switch · R01</div>
        <p className="mt-1 font-display text-[30px] leading-none" data-testid="kill-state">
          {on ? "AÇIK" : "KAPALI"}
        </p>
        {on ? (
          <dl className="mt-3 space-y-1 text-dense">
            <div className="flex gap-2">
              <dt className="opacity-80">Sebep</dt>
              <dd className="font-medium">{risk.kill_reason ?? "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="opacity-80">Açan</dt>
              <dd>
                {actorLabel(risk.kill_by)}
                {risk.kill_at ? ` · ${fmtTime(risk.kill_at, true)}` : ""}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-dense text-ink-soft">
            Açılınca yeni emir verilmez, açık emirler iptal edilir; pozisyonlar satılmaz, çıkış kuralıyla yönetilir. Otomatik tetik: zirveden −%5.
          </p>
        )}
      </div>

      {ctl.phase === "off" ? (
        <div className="space-y-2">
          <Button variant="danger" size="lg" className="w-full" disabled={!ctl.canEngage} onClick={() => setDialog("engage")} aria-describedby={ctl.canEngage ? undefined : "kill-denied"}>
            Kill switch&apos;i aç
          </Button>
          {!ctl.canEngage ? (
            <p id="kill-denied" className="text-meta text-muted">
              {deniedHint("kill_on")}
            </p>
          ) : null}
          {lastReset ? <p className="text-meta text-ink-soft">Son sıfırlama: 2/2 onaylandı · {fmtTime(lastReset)}</p> : null}
        </div>
      ) : (
        <ResetSteps risk={risk} ctl={ctl} onStart={() => setDialog("reset_start")} onConfirm={() => setDialog("reset_confirm")} />
      )}

      {DEMO_MODE ? (
        <div className={cn("mt-auto border-t pt-3", on ? "border-on-dark/40" : "border-hairline")}>
          <div className={cn("text-meta", on ? "text-on-dark/85" : "text-muted")}>Demo · Adım 4</div>
          <Button
            variant="outline"
            size="sm"
            className={cn("mt-1.5 w-full", on && "border-on-dark text-on-dark hover:bg-on-dark/10")}
            disabled={!can(user.role, "demo_inject") || on || simRunning}
            onClick={onLossSim}
            aria-describedby="losssim-hint"
          >
            {simRunning ? "Zarar simülasyonu oynuyor…" : "Zarar simülasyonu"}
          </Button>
          <p id="losssim-hint" className={cn("mt-1 text-meta", on ? "text-on-dark/80" : "text-muted")}>
            {!can(user.role, "demo_inject") ? deniedHint("demo_inject") : on ? "Kill switch açıkken çalışmaz." : "Fikstür: kayıp adım adım −%1 ve −%5 eşiklerini geçer."}
          </p>
        </div>
      ) : null}

      <ConfirmDialog
        open={dialog === "engage"}
        onOpenChange={(o) => (o ? setDialog("engage") : close())}
        title="Kill switch'i aç"
        description="Tüm yeni emirler durur ve açık emirler iptal edilir. Pozisyonlar satılmaz; çıkış kurallarıyla yönetilir. Kapatmak için iki kişi gerekir (Admin başlatır, Risk Officer onaylar)."
        phrase={KILL_PHRASE}
        confirmLabel="Kill switch'i aç"
        requireComment
        commentLabel="Gerekçe"
        pending={engage.pending}
        error={engage.error}
        onConfirm={({ comment }) => void onEngage(comment)}
      />
      <ConfirmDialog
        open={dialog === "reset_start"}
        onOpenChange={(o) => (o ? setDialog("reset_start") : close())}
        title="Sıfırlamayı başlat (1/2)"
        description="Kill switch, siz başlattıktan sonra farklı bir Risk Officer onaylayınca kapanır. Günlük −%1 durdurması bu işlemle kalkmaz."
        phrase={RESET_START_PHRASE}
        confirmLabel="Sıfırlamayı başlat"
        tone="default"
        requireComment
        commentLabel="Sıfırlama gerekçesi"
        requireTotp
        pending={startReset.pending}
        error={startReset.error}
        onConfirm={({ comment, totp }) => void onStartReset(comment, totp)}
      />
      <ConfirmDialog
        open={dialog === "reset_confirm"}
        onOpenChange={(o) => (o ? setDialog("reset_confirm") : close())}
        title="Sıfırlamayı onayla (2/2)"
        description={
          ctl.phase === "reset_pending"
            ? `${ctl.request.requested_by_name} ${fmtTime(ctl.request.requested_at)}'da başlattı: “${ctl.request.reason}”. Onayınızla kill switch kapanır ve yeni emirler yeniden mümkün olur.`
            : undefined
        }
        phrase={RESET_CONFIRM_PHRASE}
        confirmLabel="Onayla ve kapat"
        tone="default"
        requireComment
        commentLabel="Onay gerekçesi"
        requireTotp
        pending={confirmReset.pending}
        error={confirmReset.error}
        onConfirm={({ comment, totp }) => void onConfirmReset(comment, totp)}
      />
    </div>
  );
}

function ResetSteps({
  risk,
  ctl,
  onStart,
  onConfirm,
}: {
  risk: RiskStatus;
  ctl: Exclude<ReturnType<typeof killControl>, { phase: "off" }>;
  onStart: () => void;
  onConfirm: () => void;
}) {
  const req = risk.reset_request;
  return (
    <div className="space-y-3">
      <ol className="grid grid-cols-2 border border-on-dark/60 text-dense" aria-label="Sıfırlama adımları (dört göz)">
        <li className={cn("px-2.5 py-2", req ? "bg-on-dark text-north" : "")}>
          <span className="block text-meta opacity-80">1/2 · Admin</span>
          <span className="font-medium">{req ? `Başlatıldı · ${fmtTime(req.requested_at)}` : "Başlatır"}</span>
        </li>
        <li className="border-l border-on-dark/60 px-2.5 py-2">
          <span className="block text-meta opacity-80">2/2 · Risk Officer</span>
          <span className="font-medium">{req ? "Onay bekleniyor" : "Onaylar"}</span>
        </li>
      </ol>
      {ctl.phase === "on" ? (
        <>
          <Button
            variant="secondary"
            size="lg"
            className="w-full border-on-dark bg-on-dark text-north shadow-none hover:bg-panel"
            disabled={!ctl.canStartReset}
            onClick={onStart}
            aria-describedby={ctl.canStartReset ? undefined : "reset-start-denied"}
          >
            Sıfırlamayı başlat
          </Button>
          {!ctl.canStartReset ? (
            <p id="reset-start-denied" className="text-meta text-on-dark/85">
              {deniedHint("kill_reset_init")} Risk Officer ikinci adımda onaylar.
            </p>
          ) : null}
        </>
      ) : ctl.phase === "reset_pending" ? (
        <>
          <p className="text-dense" data-testid="reset-pending">
            Risk Officer onayı gerekiyor (1/2). {ctl.request.requested_by_name}: “{ctl.request.reason}”
          </p>
          <Button
            variant="secondary"
            size="lg"
            className="w-full border-on-dark bg-on-dark text-north shadow-none hover:bg-panel"
            disabled={!ctl.canConfirm}
            onClick={onConfirm}
            aria-describedby={ctl.canConfirm ? undefined : "reset-confirm-denied"}
          >
            Sıfırlamayı onayla
          </Button>
          {ctl.reason ? (
            <p id="reset-confirm-denied" className="text-meta text-on-dark/85">
              {ctl.reason}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
