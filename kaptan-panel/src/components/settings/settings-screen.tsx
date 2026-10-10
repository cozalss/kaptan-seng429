"use client";

import { useRouter } from "next/navigation";
import { DEMO_MODE } from "@/lib/api/config";
import { Button } from "@/components/ui/button";
import { logout } from "@/components/shell/session-actions";
import { BigSentence, Fleuron } from "@/components/story/ui";
import { DemoSection } from "./demo-section";
import { LimitsSection } from "./limits-section";
import { TeamSection } from "./team-section";

export { SCENARIOS } from "./demo-section";

/**
 * /ayarlar — the limits (two signatures to change), the team and who may do what, the demo
 * (guided walk, scenarios, tamper test, fresh start) and sign-out.
 */
export function SettingsScreen() {
  const router = useRouter();
  return (
    <div className="space-y-14">
      <header className="space-y-3">
        <BigSentence>Ayarlar</BigSentence>
        <nav aria-label="Ayarlar bölümleri" className="flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
          <a href="#sinirlar" className="text-ink-soft underline decoration-rule-soft underline-offset-4 hover:text-ink">
            Sınırlar
          </a>
          <a href="#ekip" className="text-ink-soft underline decoration-rule-soft underline-offset-4 hover:text-ink">
            Ekip ve roller
          </a>
          {DEMO_MODE ? (
            <a href="#demo" className="text-ink-soft underline decoration-rule-soft underline-offset-4 hover:text-ink">
              Senaryolar
            </a>
          ) : null}
        </nav>
      </header>

      <LimitsSection />
      <Fleuron />
      <TeamSection />
      {DEMO_MODE ? (
        <>
          <Fleuron />
          <DemoSection />
        </>
      ) : null}

      <div className="border-t border-hairline pt-6">
        <Button
          variant="outline"
          onClick={async () => {
            router.replace(await logout());
            router.refresh();
          }}
        >
          Çıkış
        </Button>
      </div>
    </div>
  );
}
