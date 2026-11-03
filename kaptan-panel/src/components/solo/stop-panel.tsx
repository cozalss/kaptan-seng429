"use client";

import "@/components/ufuk/ufuk.css";
import "@/components/portfolio/stop.css";

import { useState, type ReactNode } from "react";
import type { RiskStatus } from "@/lib/domain";
import { useApiMutation } from "@/lib/api/react";
import { fmtDate, fmtTime } from "@/lib/format";
import { isPerson } from "@/lib/actors";
import { isWaiting, requestRestart } from "@/lib/solo/restart";
import { dayLabel } from "@/lib/solo/words";
import { Boat } from "@/components/ufuk/boat";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";
import { notify } from "@/components/ui/toast";

/** The reason a stop writes to the record. */
const STOP_REASON = "Tek tuşla durduruldu.";
/** The reason both restart steps carry (the API asks for at least 10 letters). */
const RESTART_REASON = "Tek tuşla yeniden başlatıldı.";

/** Stop and restart, for both places that offer them (the home, Param). */
export function useStopRestart(onChanged: () => Promise<unknown>) {
  const stop = useApiMutation((api) => api.killSwitch(STOP_REASON));
  const restart = useApiMutation((api, risk: RiskStatus) => requestRestart(api, risk, RESTART_REASON));
  return {
    stopPending: stop.pending,
    stopError: stop.error,
    restartPending: restart.pending,
    restartError: restart.error,
    onStop: async () => {
      if (!(await stop.run())) return false;
      notify.success("Tüm işlemler durduruldu.");
      await onChanged();
      return true;
    },
    onRestart: async (risk: RiskStatus) => {
      const after = await restart.run(risk);
      if (!after) return false;
      if (after.kill_switch === "off") notify.success("İşlemler yeniden başladı.");
      await onChanged();
      return true;
    },
  };
}

/**
 * The emergency stop, kept calm on a calm screen: what it does and what it does not do, then one
 * outline button. The filled red appears only in the question that confirms it.
 */
export function StopCard({ pending, error, onStop }: { pending: boolean; error: string | null; onStop: () => Promise<boolean> }) {
  return (
    <section aria-labelledby="acil-durum" className="st-card">
      <h2 id="acil-durum" className="text-[20px] leading-7 font-semibold text-ink">
        Acil durum
      </h2>
      <p className="mt-1 text-body text-ink-soft">Bir şey ters gidiyorsa her şeyi tek tuşla durdur. Yeni alım satım olmaz, bekleyen işlemler iptal edilir. Elindeki hisseler satılmaz.</p>
      <ConfirmAction
        trigger={
          <Button variant="danger-outline" size="lg" className="mt-4 w-full sm:w-auto">
            Tüm işlemleri durdur
          </Button>
        }
        title="Tüm işlemler durdurulsun mu?"
        description="Yeni alım ve satım yapılmaz, bekleyen işlemler iptal edilir. Elindeki hisseler satılmaz."
        confirm="Evet, durdur"
        busy="Durduruluyor…"
        tone="critical"
        pending={pending}
        error={error}
        onConfirm={onStop}
      />
    </section>
  );
}

/**
 * Once stopped, this band comes first: who stopped it and when, that the holdings stay put, and
 * the way back. One press restarts; with real data the first press only files the request, and the
 * band then shows the wait and why it is there: a pause between a scare and the next decision.
 */
export function StoppedBanner({ risk, pending, error, onRestart }: { risk: RiskStatus; pending: boolean; error: string | null; onRestart: (risk: RiskStatus) => Promise<boolean> }) {
  const stoppedAt = risk.kill_at ?? risk.as_of;
  const waiting = isWaiting(risk);
  const readyAt = risk.reset?.ready_at ?? null;
  const who = isPerson(risk.kill_by) ? "Sen durdurdun" : "Paran en yüksek hâlinden %5 düştü; KAPtan durdurdu";
  return (
    <section aria-labelledby="acil-durum" data-testid="stop-state" className="st-stopped">
      <div className="st-stopped-text">
        <h2 id="acil-durum" className="u-chapter st-title">
          Tüm işlemler durduruldu
        </h2>
        <p className="st-line">
          {who}: {dayLabel(stoppedAt)} {fmtTime(stoppedAt)}. Yeni alım ve satım yapılmıyor. Elindeki hisseler yerinde duruyor.
        </p>
        {waiting && readyAt ? <RestartWait risk={risk} readyAt={readyAt} /> : null}
        {error ? (
          <p role="alert" className="st-error">
            {error}
          </p>
        ) : null}
      </div>
      {waiting ? (
        <Boat className="st-anchor" />
      ) : (
        <ConfirmAction
          trigger={
            <Button variant="secondary" size="lg" className="w-full shrink-0 sm:w-auto">
              İşlemleri yeniden başlat
            </Button>
          }
          title="İşlemler yeniden başlasın mı?"
          description="Öneriler yeniden onaylanabilir. Durdurmanın sebebi geçtiyse devam et."
          confirm="Evet, yeniden başlat"
          busy="Başlatılıyor…"
          tone="default"
          pending={pending}
          error={error}
          onConfirm={() => onRestart(risk)}
        />
      )}
    </section>
  );
}

/** The wait, from the request to the moment confirm opens, drawn and explained. */
function RestartWait({ risk, readyAt }: { risk: RiskStatus; readyAt: string }) {
  const askedAt = risk.reset?.started?.at ?? null;
  const from = askedAt ? Date.parse(askedAt) : null;
  const to = Date.parse(readyAt);
  const share = from !== null && to > from ? Math.max(0, Math.min(1, (Date.parse(risk.as_of) - from) / (to - from))) : 0;
  return (
    <div className="st-wait">
      <p role="status" className="st-wait-title">
        Yeniden başlatma isteğin alındı. En erken {fmtDate(readyAt)} {fmtTime(readyAt)} tarihinde açılır.
      </p>
      <div aria-hidden className="st-wait-track" style={{ "--st-at": share } as React.CSSProperties}>
        <span className="st-wait-fill" />
        <span className="st-wait-now" />
      </div>
      <p className="st-line">Bu bekleme seni korumak için var: korkuyla ya da aceleyle verilen bir karar, çoğu zaman en pahalı karardır. İstekten sonra en az 24 saat ve durdurmadan sonra en az 5 borsa günü geçmesi gerekir. O zamana kadar paran yerinde durur.</p>
    </div>
  );
}

export function ConfirmAction({
  trigger,
  title,
  description,
  confirm,
  busy,
  tone,
  pending,
  error,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirm: string;
  busy: string;
  tone: "default" | "critical";
  pending: boolean;
  error: string | null;
  onConfirm: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="sm" tone={tone} title={title} description={description}>
        {error ? (
          <p role="alert" className="mb-3 text-dense font-medium text-north">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Vazgeç
          </Button>
          <Button
            variant={tone === "critical" ? "danger" : "primary"}
            pending={pending}
            disabled={pending}
            onClick={async () => {
              if (await onConfirm()) setOpen(false);
            }}
          >
            {pending ? busy : confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
