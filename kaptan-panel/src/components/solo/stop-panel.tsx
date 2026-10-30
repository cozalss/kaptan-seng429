"use client";

import { useState, type ReactNode } from "react";
import { fmtTime } from "@/lib/format";
import { dayLabel } from "@/lib/solo/words";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";

/** The reason the single-user stop writes to the ledger. */
export const SOLO_STOP_REASON = "Benim KAPtan'ım ekranından tek tuşla durduruldu.";
/** The reason both restart steps carry (the API asks for at least 10 letters). */
export const SOLO_RESTART_REASON = "Benim KAPtan'ım ekranından yeniden başlatıldı.";

interface StopPanelProps {
  stoppedAt: string | null;
  pending: boolean;
  error: string | null;
  onStop: () => Promise<boolean>;
  onRestart: () => Promise<boolean>;
}

/**
 * The one emergency stop (the kill switch) and, once stopped, the way back. Each asks one plain
 * question before it fires. Holdings are never sold by a stop.
 */
export function StopPanel({ stoppedAt, pending, error, onStop, onRestart }: StopPanelProps) {
  if (stoppedAt) {
    return (
      <section aria-labelledby="acil-durum" className="rounded-xl border border-north/50 bg-north-tint px-4 py-4 shadow-card sm:px-5">
        <h2 id="acil-durum" className="text-title font-semibold text-north">
          Tüm işlemler durduruldu
        </h2>
        <p className="mt-1 text-ui text-ink-soft tabular-nums">
          {dayLabel(stoppedAt)} {fmtTime(stoppedAt)} itibarıyla yeni alım ve satım yapılmıyor. Elindeki hisseler yerinde duruyor.
        </p>
        <ConfirmAction
          trigger={
            <Button variant="secondary" size="lg" className="mt-4 w-full sm:w-auto">
              İşlemleri yeniden başlat
            </Button>
          }
          title="İşlemler yeniden başlasın mı?"
          description="Öneriler yeniden onaylanabilir ve onayladıkların yeniden emir olur. Durdurmanın sebebi geçtiyse devam et."
          confirm="Evet, yeniden başlat"
          busy="Başlatılıyor…"
          tone="default"
          pending={pending}
          error={error}
          onConfirm={onRestart}
        />
      </section>
    );
  }
  return (
    <section aria-labelledby="acil-durum" className="rounded-xl border border-line bg-panel shadow-card px-4 py-4 sm:px-5">
      <h2 id="acil-durum" className="text-title font-semibold text-ink">
        Acil durum
      </h2>
      <p className="mt-1 text-ui text-ink-soft">Bir şey ters gidiyorsa her şeyi tek tuşla durdur. Elindeki hisseler satılmaz.</p>
      <ConfirmAction
        trigger={
          <Button variant="danger" size="lg" className="mt-4 w-full sm:w-auto">
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
