"use client";

import { useState } from "react";
import { useApiMutation } from "@/lib/api/react";
import { turnOffDesktopAlerts } from "@/lib/alerts/desktop";
import { DEFAULT_LOOK, setLook } from "@/lib/prefs/look";
import { HOWTO_KEY } from "@/components/onboarding/seen";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";
import { RESET_BUTTON, RESET_CONFIRM, RESET_PERMISSION, RESET_TITLE, RESET_WILL, RESET_WONT } from "./settings-words";
import "./groups.css";

/** The alert-kinds copy this browser keeps (kaptan_alert_prefs); removing it makes the defaults apply again. */
const ALERT_COPY_KEY = "kaptan_alert_prefs";

/** The parts of "Ayarları sıfırla" that live in this browser. Holdings answers (kaptan-solo-holds) stay: that is not a setting. */
export function resetBrowserSettings(): void {
  turnOffDesktopAlerts();
  setLook(DEFAULT_LOOK);
  try {
    window.localStorage.removeItem(ALERT_COPY_KEY);
    window.localStorage.removeItem(HOWTO_KEY);
  } catch {
    // Storage blocked: nothing was remembered there.
  }
}

/** "Ayarları sıfırla": says what goes back to normal and what does not, then does it on the server and in this browser. */
export function ResetSettings({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const reset = useApiMutation((api) => api.resetSettings());
  const confirm = async () => {
    const done = await reset.run();
    if (!done) return;
    resetBrowserSettings();
    setOpen(false);
    onDone();
  };
  return (
    <div className="ay-reset">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" data-testid="reset-open">
            {RESET_BUTTON}
          </Button>
        </DialogTrigger>
        <DialogContent title={RESET_TITLE} description="Bunlar varsayılana döner:">
          <ul className="ay-reset-list">
            {RESET_WILL.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-body text-ink">{RESET_WONT}</p>
          <p className="ay-channel-detail mt-3">{RESET_PERMISSION}</p>
          {reset.error ? (
            <p role="alert" className="mf-error mt-3">
              {reset.error}
            </p>
          ) : null}
          <div className="cf-actions">
            <Button variant="primary" pending={reset.pending} disabled={reset.pending} onClick={() => void confirm()}>
              {RESET_CONFIRM}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
