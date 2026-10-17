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
import { askCopy, stopEffects, type Ask } from "./stop-copy";
import { Stopped } from "./stopped";

/**
 * Durdur — the kill switch. The Risk Sorumlusu or the Yönetici can stop everything with one
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
    <section aria-labelledby="durdur" className={cn("border-t-2 pt-5", stopped ? "border-north" : "border-ink")}>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="durdur" className="label">
          Durdur
        </h2>
        <p className="text-meta text-muted">Durdurmak tek kişi · yeniden açmak iki kişi</p>
      </div>
      {!stopped ? (
        <div className="space-y-6">
          {/* After the second signature the confirmation takes the title's place for this visit. */}
          <div ref={statusRef} role="status" tabIndex={-1} className="space-y-2 outline-none">
            {reopened ? (
              <>
                <p className="animate-ink-in font-display text-display leading-none text-ink">Yeniden açıldı.</p>
                <p className="text-ui text-ink-soft">İki imza tamam; tayfa yeniden çalışıyor.</p>
              </>
            ) : (
              <p className="font-display-text text-title text-balance text-ink">Bir şey ters giderse her şey tek gerekçeyle durur.</p>
            )}
          </div>
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-10">
            <ul aria-label="Durdurunca ne olur?" className="space-y-2 text-ui text-ink-soft">
              {[...stopEffects(pending.length), "Yeniden açmak iki kişi ister: Yönetici başlatır, Risk Sorumlusu onaylar."].map((line) => (
                <li key={line} className="grid grid-cols-[14px_minmax(0,1fr)] gap-2">
                  <span aria-hidden className="mt-[11px] h-px bg-rule-soft" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <Button
              variant="danger-outline"
              size="lg"
              disabled={!canStop}
              locked={!canStop}
              onClick={() => open("stop")}
              className="h-14 w-full px-9 text-body sm:w-auto"
            >
              {canStop ? <span aria-hidden className="size-2.5 bg-current" /> : null}
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
