"use client";

import "./settings.css";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApiQuery } from "@/lib/api/react";
import { realName, useSession } from "@/lib/auth/session-context";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { openHowItWorks } from "@/components/onboarding/how-it-works";
import { PageHeader } from "@/components/shell/page-frame";
import { logout } from "@/components/shell/session-actions";
import { Button } from "@/components/ui/button";
import { Boat } from "@/components/ufuk/boat";
import { LimitsSection } from "./limits-section";
import { settingsSentence, PLAIN_LIMITS, valueOf } from "./limits-logic";

/** /ayarlar: your limits and what each means for you, how KAPtan works, and your account. */
export function SettingsScreen() {
  const q = useApiQuery((api) => api.limits(), []);
  useEventStream("desk", { "limits.changed": () => void q.refetch() });
  const active = q.data?.active.values;
  const count = active ? PLAIN_LIMITS.filter((k) => valueOf(active, k) !== null).length : null;
  return (
    <div className="ay-screen">
      <PageHeader name="Ayarlar" title={settingsSentence(count)} lead="KAPtan bu sınırların dışına çıkamaz. Değiştirince hemen geçerli olur ve Geçmiş’e yazılır." />
      <LimitsSection view={q.data ?? null} error={q.error} onRetry={q.refetch} onChanged={() => void q.refetch()} />
      <HowAndAccount />
    </div>
  );
}

function HowAndAccount() {
  const router = useRouter();
  const name = realName(useSession().name);
  const [leaving, setLeaving] = useState(false);
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
      <section aria-labelledby="hesap" className="ay-account">
        <h2 id="hesap" className="u-chapter text-ink">
          Hesabın
        </h2>
        <p className="mt-2 text-body text-ink-soft">{name ? `${name} olarak girdin.` : "Giriş yaptın."} Parolan bu ekrandan değişmez; KAPtan’ın kurulum ayarlarında durur.</p>
        <Button
          variant="secondary"
          className="mt-3"
          pending={leaving}
          disabled={leaving}
          onClick={async () => {
            setLeaving(true);
            router.push(await logout());
          }}
        >
          {leaving ? "Çıkılıyor…" : "Çıkış yap"}
        </Button>
      </section>
    </div>
  );
}
