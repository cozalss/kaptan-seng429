"use client";

import { useState } from "react";
import type { RiskStatus, Signature } from "@/lib/domain";
import { ROLE_LABEL } from "@/lib/domain/user";
import { actorName } from "@/lib/actors";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";
import { useDesk } from "@/components/shell/desk-state";

/** Every written reason needs at least this many characters (the API's own rule). */
export const NOTE_MIN = 10;

type Ask = "stop" | "start" | "confirm" | null;

const ASK_COPY: Readonly<Record<Exclude<Ask, null>, { title: string; lead: string; label: string; submit: string }>> = {
  stop: {
    title: "Her şeyi durdur",
    lead: "Yeni öneri gelmez, bekleyen emirler iptal olur. Geri açmak iki kişi ister.",
    label: "Neden durduruyorsun?",
    submit: "Durdur",
  },
  start: {
    title: "Yeniden başlatmayı başlat",
    lead: "Bu birinci imza (1/2). Sistem, Risk Sorumlusu onaylayınca açılır.",
    label: "Neden yeniden başlatılmalı?",
    submit: "Başlat (1/2)",
  },
  confirm: {
    title: "Onayla ve yeniden başlat",
    lead: "Bu ikinci imza (2/2). Onaylarsan tayfa yeniden çalışır.",
    label: "Kısa notun",
    submit: "Onayla (2/2)",
  },
};

/**
 * Durdur — the kill switch. The Risk Sorumlusu or the Yönetici can stop everything with one
 * reason. Starting again takes two people (_KANONIK "Reset = Admin + Risk Officer"): the
 * Yönetici starts it, the Risk Sorumlusu confirms it — shown as two stamps.
 */
export function StopControl({ risk }: { risk: RiskStatus }) {
  const api = useApi();
  const { refresh } = useDesk();
  const { can } = useRole();
  const [ask, setAsk] = useState<Ask>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (note: string) => {
    setBusy(true);
    setError(null);
    try {
      if (ask === "stop") await api.killSwitch(note);
      else if (ask === "start") await api.startKillReset({ reason: note });
      else await api.confirmKillReset({ reason: note });
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
            Bir şey ters giderse Risk Sorumlusu ya da Yönetici her şeyi durdurur: yeni öneri gelmez, bekleyen emirler iptal olur. Elindekiler satılmaz, kendi kurallarıyla kapanır.
          </p>
          <Button variant="danger-outline" size="lg" disabled={!can("kill.stop")} onClick={() => open("stop")}>
            Durdur
          </Button>
          <Denied action="kill.stop" />
        </>
      ) : (
        <Stopped risk={risk} onStart={() => open("start")} onConfirm={() => open("confirm")} />
      )}

      <NoteDialog
        open={ask !== null}
        onClose={() => (!busy ? setAsk(null) : undefined)}
        copy={ASK_COPY[ask ?? "stop"]}
        danger={ask === "stop"}
        busy={busy}
        error={error}
        onSubmit={(n) => void submit(n)}
      />
    </section>
  );
}

function Stopped({ risk, onStart, onConfirm }: { risk: RiskStatus; onStart: () => void; onConfirm: () => void }) {
  const { can } = useRole();
  const started = risk.reset?.started ?? null;
  return (
    <div className="space-y-6" data-testid="stop-state">
      <div className="space-y-2">
        <p className="font-display text-[38px] leading-none text-north">Durduruldu.</p>
        <p className="text-[15px] text-muted">
          {actorName(risk.kill_by)}
          {risk.kill_at ? ` · ${fmtTime(risk.kill_at)}` : ""}
          {risk.kill_reason ? ` — “${risk.kill_reason}”` : ""}
        </p>
      </div>
      <p className="max-w-[560px] text-[17px] leading-[27px] text-ink-soft">
        Yeniden başlatmak iki kişi ister: Yönetici başlatır, Risk Sorumlusu onaylar. Tek kişi sistemi geri açamaz.
      </p>
      <ol aria-label="Yeniden başlatma imzaları" className="grid gap-3 sm:grid-cols-2">
        <ResetStamp n="1" role="Yönetici başlatır" sig={started} />
        <ResetStamp n="2" role="Risk Sorumlusu onaylar" sig={null} waiting={started !== null} />
      </ol>
      {started === null ? (
        <div className="space-y-2.5">
          <Button variant="secondary" size="lg" disabled={!can("kill.reset_start")} onClick={onStart}>
            Yeniden başlatmayı başlat
          </Button>
          <Denied action="kill.reset_start" />
        </div>
      ) : (
        <div className="space-y-2.5">
          <Button variant="primary" size="lg" disabled={!can("kill.reset_confirm")} onClick={onConfirm}>
            Onayla ve yeniden başlat
          </Button>
          <Denied action="kill.reset_confirm" />
        </div>
      )}
    </div>
  );
}

function ResetStamp({ n, role, sig, waiting = false }: { n: string; role: string; sig: Signature | null; waiting?: boolean }) {
  return (
    <li
      data-testid={`reset-stamp-${n}`}
      className={cn("flex items-start gap-3 border-[1.5px] px-3.5 py-3", sig ? "border-ink bg-panel shadow-ink" : "border-dashed border-rule-soft")}
    >
      <span
        aria-hidden
        className={cn(
          "mt-[1px] grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] text-[12px] font-medium",
          sig ? "border-ink bg-ink text-on-dark" : "border-wash text-wash",
        )}
      >
        {sig ? "✓" : n}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-ink">
          {role} <span className="font-normal text-muted">· {n}/2</span>
        </span>
        <span className="mt-0.5 block text-[13px] leading-[18px] text-muted">
          {sig ? `${sig.name} · ${ROLE_LABEL[sig.role]} · ${fmtTime(sig.at)}` : waiting ? "imza bekleniyor" : "henüz yok"}
        </span>
        {sig?.reason ? <span className="mt-1 block text-[14px] leading-[20px] text-ink-soft">“{sig.reason}”</span> : null}
      </span>
    </li>
  );
}

function NoteDialog({
  open,
  onClose,
  copy,
  danger,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  copy: { title: string; lead: string; label: string; submit: string };
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
      <DialogContent title={copy.title} description={copy.lead} size="sm" tone={danger ? "critical" : "default"}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!short) onSubmit(note.trim());
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-[14px] text-ink-soft">{copy.label}</span>
            <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            <span className="block text-[12px] text-muted">En az {NOTE_MIN} harf; denetim defterine yazılır.</span>
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
              {busy ? "Kaydediliyor…" : copy.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
