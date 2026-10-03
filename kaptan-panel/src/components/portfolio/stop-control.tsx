"use client";

import { useState } from "react";
import type { RiskStatus } from "@/lib/domain";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { useNow } from "@/lib/clock";
import { fmtDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { useDesk } from "@/components/shell/desk-state";
import { resetClockMs } from "./reset-timeline";

/** Every written confirmation needs at least this many characters (the API's own rule). */
export const NOTE_MIN = 10;

type Ask = "stop" | "first" | "second" | null;

/**
 * Durdur — the kill switch, in plain words. Stopping takes one short written reason; that
 * reason is also your first confirmation, so the personal rule starts at once: to start again
 * you wait 24 hours and 5 sessions, then confirm a second time (_KANONIK, kişisel mod).
 */
export function StopControl({ risk }: { risk: RiskStatus }) {
  const api = useApi();
  const { refresh } = useDesk();
  const [ask, setAsk] = useState<Ask>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (note: string) => {
    setBusy(true);
    setError(null);
    try {
      if (ask === "stop") {
        await api.killSwitch(note);
        await api.confirmKillReset({ reason: note });
      } else {
        await api.confirmKillReset({ reason: note });
      }
      setAsk(null);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const open = (a: Ask) => {
    setError(null);
    setAsk(a);
  };

  return (
    <section aria-labelledby="durdur" className="space-y-4">
      <h2 id="durdur" className="text-[13px] font-medium tracking-[0.04em] text-ink uppercase">
        Durdur
      </h2>
      {risk.kill_switch === "off" ? (
        <>
          <p className="max-w-[560px] text-[17px] leading-[27px] text-ink-soft">
            Bir şey ters giderse her şeyi durdurabilirsin: yeni öneri gelmez, bekleyen emirler iptal olur. Elindekiler satılmaz, kendi kurallarıyla kapanır.
          </p>
          <Button variant="danger-outline" size="lg" onClick={() => open("stop")}>
            Durdur
          </Button>
        </>
      ) : (
        <Stopped risk={risk} onFirst={() => open("first")} onSecond={() => open("second")} />
      )}

      <NoteDialog
        open={ask !== null}
        onClose={() => (!busy ? setAsk(null) : undefined)}
        title={ask === "stop" ? "Her şeyi durdur" : ask === "second" ? "Yeniden başlat" : "Yeniden başlatmayı iste"}
        lead={
          ask === "stop"
            ? "Yeni öneri gelmez, bekleyen emirler iptal olur. Yeniden başlatmak için 24 saat ve 5 seans beklersin."
            : ask === "second"
              ? "Bekleme doldu. Bu ikinci onayla tayfa yeniden çalışır."
              : "Bu ilk onayın. Ardından 24 saat ve 5 seans beklersin."
        }
        label={ask === "stop" ? "Neden durduruyorsun?" : "Kısa notun"}
        submitLabel={ask === "stop" ? "Durdur" : ask === "second" ? "Yeniden başlat" : "Onayla"}
        danger={ask === "stop"}
        busy={busy}
        error={error}
        onSubmit={(n) => void submit(n)}
      />
    </section>
  );
}

function Stopped({ risk, onFirst, onSecond }: { risk: RiskStatus; onFirst: () => void; onSecond: () => void }) {
  const now = useNow(1_000);
  const reset = risk.reset;
  if (!reset) return null;
  const clock = now === null ? null : resetClockMs(now, risk.demo_clock_offset_h);
  const left = reset.ready_at && clock !== null ? Date.parse(reset.ready_at) - clock : null;
  const sessions = Math.min(reset.sessions_since_kill, reset.sessions_required);

  return (
    <div className="space-y-5" data-testid="stop-state">
      <p className="font-display text-[38px] leading-none text-north">Durduruldu.</p>
      {reset.next_step === "first" ? (
        <>
          <p className="max-w-[560px] text-[17px] leading-[27px] text-ink-soft">
            Yeniden başlatmak istersen önce kısa bir not yaz. Sonra 24 saat ve 5 seans beklersin.
          </p>
          <Button variant="secondary" size="lg" onClick={onFirst}>
            Yeniden başlatmayı iste
          </Button>
        </>
      ) : (
        <>
          <p className="max-w-[560px] text-[17px] leading-[27px] text-ink-soft">
            {reset.next_step === "second" ? "Bekleme doldu. İstersen yeniden başlatabilirsin." : "Yeniden başlatmak için 24 saat ve 5 seans beklemen gerekiyor."}
          </p>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p className="text-[12px] text-muted">Kalan</p>
              <p className="mt-1 font-display text-[30px] leading-none text-ink tabular-nums" data-testid="reset-left">
                {left === null ? "…" : left > 0 ? fmtDuration(left) : "doldu"}
              </p>
            </div>
            <div>
              <p className="text-[12px] text-muted">
                Seans · {sessions}/{reset.sessions_required}
              </p>
              <ol aria-label={`${sessions}/${reset.sessions_required} seans kapandı`} className="mt-2 flex gap-1.5">
                {Array.from({ length: reset.sessions_required }, (_, i) => (
                  <li key={i} className={cn("size-3 rotate-45 border-[1.5px] border-ink", i < sessions ? "bg-ink" : "bg-transparent")} />
                ))}
              </ol>
            </div>
          </div>
          <Button variant="primary" size="lg" disabled={reset.next_step !== "second"} onClick={onSecond}>
            Yeniden başlat
          </Button>
        </>
      )}
    </div>
  );
}

function NoteDialog({
  open,
  onClose,
  title,
  lead,
  label,
  submitLabel,
  danger,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  lead: string;
  label: string;
  submitLabel: string;
  danger: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setNote("");
  }
  const short = note.trim().length < NOTE_MIN;
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent title={title} description={lead} size="sm" tone={danger ? "critical" : "default"}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!short) onSubmit(note.trim());
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-[14px] text-ink-soft">{label}</span>
            <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            <span className="block text-[12px] text-muted">En az {NOTE_MIN} harf; kayda geçer.</span>
          </label>
          {error ? (
            <p role="alert" className="text-[14px] text-north">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="submit" variant={danger ? "danger" : "primary"} disabled={short || busy}>
              {busy ? "Kaydediliyor…" : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
