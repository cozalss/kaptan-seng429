"use client";

import { useState, useSyncExternalStore } from "react";
import type { AlertSettings } from "@/lib/domain";
import type { AlertPermission } from "@/lib/alerts/alerts";
import { desktopAlertsOn, desktopPermission, subscribeDesktopAlerts, turnOffDesktopAlerts, turnOnDesktopAlerts } from "@/lib/alerts/desktop";
import { useApiMutation, useApiQuery } from "@/lib/api/react";
import { Button } from "@/components/ui/button";
import { ALERTS_LEAD, alertsSentence, channelWords, desktopWords, lastResult, PHONE_SETUP_AFTER, PHONE_SETUP_STEPS, TEST_BUTTON, testOutcome, type LastResult } from "./alerts-words";

/** One string, so the store's snapshot is stable between changes. */
const desktopSnapshot = () => `${desktopAlertsOn() ? "on" : "off"}|${desktopPermission()}`;
const serverSnapshot = () => "off|default";

function useDesktopAlerts(): { on: boolean; permission: AlertPermission } {
  const [on, permission] = useSyncExternalStore(subscribeDesktopAlerts, desktopSnapshot, serverSnapshot).split("|") as [string, AlertPermission];
  return { on: on === "on", permission };
}

/**
 * Bildirimler: how KAPtan reaches you when a suggestion arrives. This computer (the browser's own
 * notifications, asked for only on the button), then the phone and e-mail channels set up at
 * install, with a test and its result, or the three steps to set them up.
 */
export function AlertsSection() {
  const desktop = useDesktopAlerts();
  const q = useApiQuery((api) => api.alertSettings(), []);
  const test = useApiMutation((api) => api.testAlerts());
  const [tested, setTested] = useState<AlertSettings | null>(null);
  const settings = tested ?? q.data ?? null;
  const anyChannel = Boolean(settings?.ntfy || settings?.email);
  const outcome: LastResult | null = tested ? testOutcome(tested) : settings ? lastResult(settings) : null;

  return (
    <section aria-labelledby="bildirim-ayari" id="bildirim" className="ay-block">
      <h2 id="bildirim-ayari">
        <span className="pf-name">
          Bildirimler<span className="sr-only">. </span>
        </span>
        <span className="u-chapter block text-ink">{alertsSentence(desktop.on, settings)}</span>
      </h2>
      <p className="ay-block-lead">{ALERTS_LEAD}</p>

      <ul aria-label="Bildirim yolları" className="ay-channels">
        <DesktopRow on={desktop.on} permission={desktop.permission} />
        <ChannelRow name="Telefon" {...channelWords("ntfy", settings, q.error)} />
        <ChannelRow name="E-posta" {...channelWords("email", settings, q.error)} />
      </ul>

      {anyChannel ? (
        <div className="ay-test">
          <Button
            variant="secondary"
            pending={test.pending}
            disabled={test.pending}
            onClick={async () => {
              const result = await test.run();
              if (result) setTested(result);
            }}
          >
            {test.pending ? "Gönderiliyor…" : TEST_BUTTON}
          </Button>
          <p className="ay-test-note">Telefonuna ve e-postana gider; bu bilgisayarda görünmez.</p>
        </div>
      ) : null}
      {/* Always mounted, so the result is read out when it arrives. */}
      <p role="status" className="ay-result" data-ok={test.error ? "false" : (outcome?.ok ?? true)}>
        {test.error ?? outcome?.text ?? ""}
      </p>

      {settings && !anyChannel ? <PhoneSetup /> : null}
    </section>
  );
}

function DesktopRow({ on, permission }: { on: boolean; permission: AlertPermission }) {
  const [busy, setBusy] = useState(false);
  const words = desktopWords(on, permission);
  const press = async () => {
    if (on) return turnOffDesktopAlerts();
    setBusy(true);
    await turnOnDesktopAlerts();
    setBusy(false);
  };
  return (
    <li className="ay-channel">
      <h3 className="ay-title">Bu bilgisayar</h3>
      <div className="min-w-0">
        <p className="ay-channel-state">{words.state}</p>
        <p className="ay-channel-detail">{words.detail}</p>
      </div>
      {words.action ? (
        <Button variant="secondary" className="ay-channel-act" aria-label={`${words.action}: bu bilgisayarın bildirimleri`} pending={busy} disabled={busy} onClick={() => void press()}>
          {words.action}
        </Button>
      ) : null}
    </li>
  );
}

function ChannelRow({ name, state, detail }: { name: string; state: string; detail: string | null }) {
  return (
    <li className="ay-channel">
      <h3 className="ay-title">{name}</h3>
      <div className="min-w-0">
        <p className="ay-channel-state">{state}</p>
        {detail ? <p className="ay-channel-detail">{detail}</p> : null}
      </div>
    </li>
  );
}

/** Nothing reaches the phone yet: the three steps, in order. */
function PhoneSetup() {
  return (
    <div className="ay-setup">
      <h3 className="ay-setup-head">Telefonuna da haber vermem için üç adım</h3>
      <ol className="ay-steps">
        {PHONE_SETUP_STEPS.map((step, i) => (
          <li key={step} className="ay-step">
            <span aria-hidden className="ay-step-n">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="ay-channel-detail">{PHONE_SETUP_AFTER}</p>
    </div>
  );
}
