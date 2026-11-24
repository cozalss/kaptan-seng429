"use client";

import "./settings.css";

import { useApiQuery } from "@/lib/api/react";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { openHowItWorks } from "@/components/onboarding/how-it-works";
import { PageHeader } from "@/components/shell/page-frame";
import { Button } from "@/components/ui/button";
import { Boat } from "@/components/ufuk/boat";
import { AccountSection } from "./account-section";
import { AlertPrefsSection } from "./alert-prefs-section";
import { AlertHistorySection } from "./alert-history-section";
import { AlertsSection } from "./alerts-section";
import { BackupSection } from "./backup-section";
import { FeeSection } from "./fee-section";
import { LimitsSection } from "./limits-section";
import { LookSection } from "./look-section";
import { MutedSection } from "./muted-section";
import { PauseSection } from "./pause-section";
import { settingsSentence, PLAIN_LIMITS, valueOf } from "./limits-logic";
import { PriceAlertsSection } from "./price-alerts-section";
import { RestoreSection } from "./restore-section";
import { SystemSection } from "./system-section";
import { TelegramSection } from "./telegram-section";

/** /ayarlar: your limits and what each means for you, how KAPtan reaches you and whether it is working, how it works, and your account. */
export function SettingsScreen() {
  const q = useApiQuery((api) => api.limits(), []);
  useEventStream("desk", { "limits.changed": () => void q.refetch() });
  const active = q.data?.active.values;
  const count = active ? PLAIN_LIMITS.filter((k) => valueOf(active, k) !== null).length : null;
  return (
    <div className="ay-screen">
      <PageHeader name="Ayarlar" title={settingsSentence(count)} lead="KAPtan bu sınırların dışına çıkmaz; tek işlemdeki kayıp da senin koyduğun sınırı aşmaz, adet aşağı yuvarlanır. Değiştirince hemen geçerli olur ve Geçmiş’e yazılır." />
      <LimitsSection view={q.data ?? null} error={q.error} onRetry={q.refetch} onChanged={() => void q.refetch()} />
      <PauseSection />
      <FeeSection />
      <div className="ay-pair">
        <AlertsSection />
        <SystemSection />
      </div>
      <TelegramSection />
      <AlertPrefsSection />
      <PriceAlertsSection />
      <MutedSection />
      <AlertHistorySection />
      <div className="ay-pair">
        <BackupSection />
        <LookSection />
      </div>
      <RestoreSection />
      <HowAndAccount />
    </div>
  );
}

function HowAndAccount() {
  return (
    <div className="ay-pair">
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
      <AccountSection />
    </div>
  );
}
