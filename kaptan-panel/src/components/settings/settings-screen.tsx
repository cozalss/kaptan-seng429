"use client";

import { useRouter } from "next/navigation";
import { DEMO_MODE } from "@/lib/api/config";
import { ROLE_LABEL } from "@/lib/domain/user";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { logout } from "@/components/shell/session-actions";
import { BigSentence, Fleuron } from "@/components/story/ui";
import { RoleEmblem } from "@/components/roles/role-emblem";
import { useRole } from "@/components/roles/use-role";
import { DemoSection } from "./demo-section";
import { LimitsSection } from "./limits-section";
import { SectionNav, type SectionLink } from "./section-nav";
import { TeamSection } from "./team-section";
import { TourCard } from "./tour-card";

export { SCENARIOS } from "./demo-section";

const LINKS: readonly SectionLink[] = [
  { id: "sinirlar", label: "Sınırlar" },
  { id: "ekip", label: "Ekip ve roller" },
  ...(DEMO_MODE ? [{ id: "demo", label: "Senaryolar" }] : []),
];

/**
 * /ayarlar — the guided tour first, then the limits (two signatures to change), the team and
 * who may do what, the scenarios (tamper test, fresh start) and sign-out.
 */
export function SettingsScreen() {
  return (
    <div className="space-y-10">
      <header className="space-y-6">
        {/* One word, set large: Bodoni's A opens with a hairline that fades away at 38px. */}
        <BigSentence focusTarget className="text-display-lg sm:text-hero">
          Ayarlar
        </BigSentence>
        <SectionNav links={LINKS} />
      </header>

      {DEMO_MODE ? <TourCard /> : null}
      <LimitsSection />
      <Fleuron />
      <TeamSection />
      {DEMO_MODE ? (
        <>
          <Fleuron />
          <DemoSection />
        </>
      ) : null}

      <SessionEnd />
    </div>
  );
}

/** The page closes on the session: whose eyes you are using now, and the way out. */
function SessionEnd() {
  const router = useRouter();
  const { role, user } = useRole();
  return (
    <div className={cn(`tone-${role}`, "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t-[1.5px] border-ink pt-5")}>
      <p className="flex items-center gap-2 text-ui text-ink-soft">
        <RoleEmblem role={role} className="size-[14px] shrink-0 text-[var(--tone)]" />
        <span>
          Bu tarayıcıda <span className="text-ink">{user.name}</span> olarak açıksın
          {user.name === ROLE_LABEL[role] ? "." : `; ${ROLE_LABEL[role]} gözüyle bakıyorsun.`}
        </span>
      </p>
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
  );
}
