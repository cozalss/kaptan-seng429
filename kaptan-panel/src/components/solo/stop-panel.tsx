"use client";

import { useState, type ReactNode } from "react";
import { fmtTime } from "@/lib/format";
import type { SoloRights } from "@/lib/solo/rights";
import { dayLabel } from "@/lib/solo/words";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";

/** The reason the single-user stop writes to the ledger. */
export const SOLO_STOP_REASON = "Benim KAPtan'ım ekranından tek tuşla durduruldu.";
/** The reason both restart steps carry (the API asks for at least 10 letters). */
export const SOLO_RESTART_REASON = "Benim KAPtan'ım ekranından yeniden başlatıldı.";

type StopRights = Pick<SoloRights, "stop" | "stopWhy" | "restart" | "restartWhy">;

/**
 * The emergency stop (the kill switch), kept quiet on a calm home: a small card with an outline
 * button; the filled red appears only in the question that confirms it. Holdings are never sold.
 */
export function StopCard({ rights, pending, error, onStop }: { rights: StopRights; pending: boolean; error: string | null; onStop: () => Promise<boolean> }) {
  return (
    <section aria-labelledby="acil-durum" className="rounded-2xl border border-line bg-panel px-5 py-4 shadow-card">
      <h2 id="acil-durum" className="text-body font-semibold text-ink">
        Acil durum
      </h2>
      <p className="mt-1 text-dense text-ink-soft">Bir şey ters gidiyorsa her şeyi tek tuşla durdur. Elindeki hisseler satılmaz.</p>
      {rights.stop ? (
        <ConfirmAction
          trigger={
            <Button variant="danger-outline" size="md" className="mt-3 w-full sm:w-auto">
              Tüm işlemleri durdur
            </Button>
          }
          title="Tüm işlemler durdurulsun mu?"
          description="Yeni alım ve satım yapılmaz, bekleyen emirler iptal edilir. Elindeki hisseler satılmaz."
          confirm="Evet, durdur"
          busy="Durduruluyor…"
          tone="critical"
          pending={pending}
          error={error}
          onConfirm={onStop}
        />
      ) : (
        <>
          <Button variant="danger-outline" size="md" className="mt-3 w-full sm:w-auto" disabled>
            Tüm işlemleri durdur
          </Button>
          <p className="mt-2 text-meta text-muted">{rights.stopWhy}</p>
        </>
      )}
    </section>
  );
}

const RESTART_COPY = {
  both: {
    trigger: "İşlemleri yeniden başlat",
    title: "İşlemler yeniden başlasın mı?",
    description: "Öneriler yeniden onaylanabilir ve onayladıkların yeniden emir olur. Durdurmanın sebebi geçtiyse devam et.",
    confirm: "Evet, yeniden başlat",
    busy: "Başlatılıyor…",
  },
  start: {
    trigger: "Yeniden başlatmayı iste (1/2)",
    title: "Yeniden başlatma istensin mi?",
    description: "İkinci kişi (Risk Sorumlusu) onaylayınca işlemler yeniden başlar.",
    confirm: "Evet, iste",
    busy: "İsteniyor…",
  },
  confirm: {
    trigger: "Yeniden başlatmayı onayla (2/2)",
    title: "İşlemler yeniden başlasın mı?",
    description: "İkinci imzayı sen atıyorsun: onaylayınca öneriler yeniden onaylanabilir.",
    confirm: "Evet, onayla",
    busy: "Başlatılıyor…",
  },
} as const;

/**
 * Once stopped, the home opens with this band above everything: when it stopped, that holdings
 * stay put, and the way back — one step for one person, or this person's step of two on a team.
 */
export function StoppedBanner({
  stoppedAt,
  requestedBy,
  rights,
  pending,
  error,
  onRestart,
}: {
  stoppedAt: string;
  requestedBy: string | null;
  rights: StopRights;
  pending: boolean;
  error: string | null;
  onRestart: () => Promise<boolean>;
}) {
  const step = rights.restart;
  const copy = step ? RESTART_COPY[step] : null;
  return (
    <section aria-labelledby="acil-durum" className="animate-page-in flex flex-col gap-4 rounded-2xl border border-north/40 bg-north-tint px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex min-w-0 gap-3">
        <span aria-hidden className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-north text-on-dark">
          <svg viewBox="0 0 12 12" className="size-3" fill="currentColor">
            <rect x="3" y="3" width="6" height="6" rx="1" />
          </svg>
        </span>
        <div className="min-w-0">
          <h2 id="acil-durum" className="text-body font-semibold text-north">
            Tüm işlemler durduruldu
          </h2>
          <p className="mt-0.5 text-dense text-ink-soft tabular-nums">
            {dayLabel(stoppedAt)} {fmtTime(stoppedAt)} itibarıyla yeni alım ve satım yapılmıyor. Elindeki hisseler yerinde duruyor.
          </p>
          {requestedBy ? <p className="mt-0.5 text-dense text-ink-soft">{requestedBy} yeniden başlatmayı istedi (1/2).</p> : null}
          {!copy && rights.restartWhy ? <p className="mt-0.5 text-dense font-medium text-ink">{rights.restartWhy}</p> : null}
        </div>
      </div>
      {copy ? (
        <ConfirmAction
          trigger={
            <Button variant="secondary" size="md" className="w-full shrink-0 sm:w-auto">
              {copy.trigger}
            </Button>
          }
          title={copy.title}
          description={copy.description}
          confirm={copy.confirm}
          busy={copy.busy}
          tone="default"
          pending={pending}
          error={error}
          onConfirm={onRestart}
        />
      ) : null}
    </section>
  );
}

function ConfirmAction({
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
