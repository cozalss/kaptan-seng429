"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import "./settings.css";

import { useApiQuery } from "@/lib/api/react";
import { desktopAlertsOn, desktopPermission, subscribeDesktopAlerts } from "@/lib/alerts/desktop";
import { useLook } from "@/lib/prefs/look";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { openHowItWorks } from "@/components/onboarding/how-it-works";
import { useDesk } from "@/components/shell/desk-state";
import { PageHeader } from "@/components/shell/page-frame";
import { Button } from "@/components/ui/button";
import { Boat } from "@/components/ufuk/boat";
import { AccountSection } from "./account-section";
import { AlertPrefsSection } from "./alert-prefs-section";
import { AlertHistorySection } from "./alert-history-section";
import { AlertsSection } from "./alerts-section";
import { BackupSection } from "./backup-section";
import { FeeSection } from "./fee-section";
import { LearningSection } from "./learning-section";
import { LimitsSection } from "./limits-section";
import { LookSection } from "./look-section";
import { MutedSection } from "./muted-section";
import { PauseSection } from "./pause-section";
import { PLAIN_LIMITS, valueOf } from "./limits-logic";
import { PriceAlertsSection } from "./price-alerts-section";
import { ResetSettings } from "./reset-settings";
import { RestoreSection } from "./restore-section";
import { AdvancedFold, SettingsGroup } from "./settings-group";
import { onSettingsChanged } from "./settings-events";
import { accountSummary, GROUP, lookSummary, moneySummary, notifySummary, RESET_DONE } from "./settings-words";
import { SystemSection } from "./system-section";
import { TelegramSection } from "./telegram-section";

type GroupId = keyof typeof GROUP;
const DANGER_ID = "sifirla";

const desktopSnapshot = () => (desktopAlertsOn() && desktopPermission() === "granted" ? "on" : "off");

/**
 * /ayarlar: four plain groups, each with one line of what is set now and the details behind "Değiştir":
 * the phone and notifications, money and limits, the look, and the account with backups and system status.
 * "Ayarları sıfırla" puts the notification and look settings back to normal.
 */
export function SettingsScreen() {
  const [open, setOpen] = useState<Partial<Record<GroupId, boolean>>>({});
  const [epoch, setEpoch] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const toggle = (g: GroupId) => (value: boolean) => setOpen((prev) => ({ ...prev, [g]: value }));
  // The anchor list (and an old link) names a group: open it.
  useEffect(() => {
    const fromAddress = () => {
      const id = window.location.hash.slice(1);
      const g = (Object.keys(GROUP) as GroupId[]).find((k) => GROUP[k].id === id);
      if (g) setOpen((prev) => ({ ...prev, [g]: true }));
    };
    fromAddress();
    window.addEventListener("hashchange", fromAddress);
    return () => window.removeEventListener("hashchange", fromAddress);
  }, []);
  const done = () => {
    setEpoch((n) => n + 1);
    setNotice(RESET_DONE);
    window.scrollTo({ top: 0 });
  };
  return (
    <div className="ay-screen">
      <PageHeader name="Ayarlar" title="Senin ayarların" lead="Değiştirmek istediğin grubun yanındaki “Değiştir”e bas. Değişiklik hemen geçerli olur." />
      <p role="status" className="ay-notice" hidden={notice === null} data-testid="reset-notice">
        {notice ?? ""}
      </p>
      <div className="ay-layout">
        <nav aria-label="Ayarlar bölümleri" className="ay-anchors">
          <ul>
            {(Object.keys(GROUP) as GroupId[]).map((g) => (
              <li key={g}>
                <a href={`#${GROUP[g].id}`}>{GROUP[g].name}</a>
              </li>
            ))}
            <li>
              <a href={`#${DANGER_ID}`}>Ayarları sıfırla</a>
            </li>
          </ul>
        </nav>
        <div>
          <Groups key={epoch} open={open} toggle={toggle} onReset={done} />
        </div>
      </div>
    </div>
  );
}

function Groups({ open, toggle, onReset }: { open: Partial<Record<GroupId, boolean>>; toggle: (g: GroupId) => (v: boolean) => void; onReset: () => void }): ReactNode {
  const limits = useApiQuery((api) => api.limits(), []);
  useEventStream("desk", { "limits.changed": () => void limits.refetch() });
  const telegram = useApiQuery((api) => api.telegramStatus(), []);
  const prefs = useApiQuery((api) => api.preferences(), []);
  const backup = useApiQuery((api) => api.backupStatus(), []);
  const { refetch: refetchPrefs } = prefs;
  const { refetch: refetchTelegram } = telegram;
  useEffect(
    () =>
      onSettingsChanged(() => {
        void refetchPrefs();
        void refetchTelegram();
      }),
    [refetchPrefs, refetchTelegram],
  );
  const { system } = useDesk();
  const desktopOn = useSyncExternalStore(subscribeDesktopAlerts, desktopSnapshot, () => "off") === "on";
  const [look] = useLook();
  const active = limits.data?.active.values;
  const count = active ? PLAIN_LIMITS.filter((k) => valueOf(active, k) !== null).length : null;
  const fromCompanyPage = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("sustur");

  return (
    <>
      <SettingsGroup
        {...GROUP.notify}
        summary={notifySummary({ telegram: telegram.data ?? null, desktopOn, alerts: prefs.data?.alerts ?? null, pause: prefs.data?.pause ?? null })}
        open={open.notify ?? false}
        onOpenChange={toggle("notify")}
        openFor={fromCompanyPage}
      >
        <TelegramSection />
        <AlertsSection />
        <AlertPrefsSection />
        <MutedSection />
        <PriceAlertsSection />
        <PauseSection />
        <AdvancedFold>
          <AlertHistorySection />
        </AdvancedFold>
        <ResetSettings onDone={onReset} />
      </SettingsGroup>

      <SettingsGroup {...GROUP.money} summary={moneySummary(count)} open={open.money ?? false} onOpenChange={toggle("money")}>
        <LimitsSection view={limits.data ?? null} error={limits.error} onRetry={limits.refetch} onChanged={() => void limits.refetch()} />
        <FeeSection />
        <LearningSection />
      </SettingsGroup>

      <SettingsGroup {...GROUP.look} summary={lookSummary(look)} open={open.look ?? false} onOpenChange={toggle("look")}>
        <LookSection />
        <ResetSettings onDone={onReset} />
      </SettingsGroup>

      <SettingsGroup
        {...GROUP.account}
        summary={accountSummary(backup.data ?? null, system ? system.problems.length : null)}
        open={open.account ?? false}
        onOpenChange={toggle("account")}
      >
        <AccountSection />
        <BackupSection />
        <SystemSection />
        <HowItWorks />
        <AdvancedFold>
          <RestoreSection />
        </AdvancedFold>
      </SettingsGroup>
      <section aria-labelledby={`${DANGER_ID}-baslik`} id={DANGER_ID} className="ay-group ay-danger">
        <h2 id={`${DANGER_ID}-baslik`} className="ay-group-name">
          Ayarları sıfırla
        </h2>
        <p className="ay-group-sum">Bildirim, tema ve yazı ayarlarını varsayılana döndürür. Önce neyin değişeceğini görürsün; paran ve kayıtların değişmez.</p>
        <ResetSettings onDone={onReset} />
      </section>
    </>
  );
}

function HowItWorks() {
  return (
    <section aria-labelledby="nasil" className="ay-how">
      <Boat className="ay-how-boat" />
      <div>
        <h2 id="nasil" className="u-chapter text-ink">
          KAPtan nasıl çalışır?
        </h2>
        <p className="mt-2 text-body text-ink-soft">Üç kısa adımda: ne okur, nasıl süzer, kararı neden sen verirsin.</p>
        <Button variant="secondary" className="mt-3" onClick={openHowItWorks}>
          Yeniden göster
        </Button>
      </div>
    </section>
  );
}
