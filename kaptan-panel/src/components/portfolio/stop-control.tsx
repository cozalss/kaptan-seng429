"use client";

import { useRef, useState } from "react";
import type { RiskStatus } from "@/lib/domain";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";
import { useDesk } from "@/components/shell/desk-state";
import { NoteDialog } from "./note-dialog";
import { CARD, CARD_PAD, Pill } from "./kit";
import { askCopy, stopSentence, type Ask } from "./stop-copy";
import { Stopped } from "./stopped";

/**
 * Durdur — the kill switch, as one compact card. The Risk Sorumlusu or the Yönetici can stop everything with one
 * reason. Starting again takes two people (_KANONIK "Reset = Admin + Risk Officer"): the
 * Yönetici starts it, the Risk Sorumlusu confirms it — shown as two stamps. After each step
 * taken here, focus lands on the new state, so a screen reader hears what changed.
 */
export function StopControl({ risk }: { risk: RiskStatus }) {
  const api = useApi();
  const { refresh, pending } = useDesk();
  const { can } = useRole();
  const [ask, setAsk] = useState<Ask | null>(null);
  // The dialog keeps its words while it fades out after `ask` is cleared.
  const [shown, setShown] = useState<Ask>("stop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justChanged, setJustChanged] = useState<Ask | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const focusAfterClose = useRef(false);

  const submit = async (note: string) => {
    if (ask === null) return;
    setBusy(true);
    setError(null);
    try {
      if (ask === "stop") await api.killSwitch(note);
      else if (ask === "start") await api.startKillReset({ reason: note });
      else await api.confirmKillReset({ reason: note });
      // The new state is on the page before the dialog closes, so focus has a place to land.
      await refresh();
      focusAfterClose.current = true;
      setJustChanged(ask);
      setAsk(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const open = (a: Ask) => {
    setError(null);
    setShown(a);
    setAsk(a);
  };

  const canStop = can("kill.stop");
  const reopened = justChanged === "confirm";
  const stopped = risk.kill_switch === "on";
  return (
    <section aria-labelledby="durdur" className={cn(CARD, CARD_PAD, "space-y-5", stopped && "border-north")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="durdur" className="text-[18px] leading-7 font-semibold text-ink">
          Durdur
        </h2>
        {stopped ? <Pill tone="north">Durduruldu</Pill> : <Pill tone="gain">Çalışıyor</Pill>}
      </div>
      {!stopped ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
            {/* After the second signature the confirmation takes the sentence's place for this visit. */}
            <div ref={statusRef} role="status" tabIndex={-1} className="outline-none">
              {reopened ? (
                <p className="text-ui text-ink">
                  <span className="font-semibold text-gain">Yeniden açıldı.</span> İki imza tamam; sistem yeniden çalışıyor.
                </p>
              ) : (
                <p className="max-w-[460px] text-ui text-ink-soft">{stopSentence(pending.length)}</p>
              )}
            </div>
            <Button variant="danger" size="lg" disabled={!canStop} locked={!canStop} onClick={() => open("stop")} className="w-full sm:w-auto">
              Durdur
            </Button>
          </div>
          <Denied action="kill.stop" />
        </div>
      ) : (
        <Stopped risk={risk} onStart={() => open("start")} onConfirm={() => open("confirm")} justChanged={justChanged} statusRef={statusRef} />
      )}

      <NoteDialog
        open={ask !== null}
        onClose={() => (!busy ? setAsk(null) : undefined)}
        copy={askCopy(shown, pending.length)}
        danger={shown === "stop"}
        busy={busy}
        error={error}
        onSubmit={(n) => void submit(n)}
        onCloseAutoFocus={(e) => {
          if (!focusAfterClose.current) return;
          focusAfterClose.current = false;
          e.preventDefault();
          statusRef.current?.focus();
        }}
      />
    </section>
  );
}
