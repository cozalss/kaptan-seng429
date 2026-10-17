"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { DEMO_MODE } from "@/lib/api/config";
import { cn } from "@/lib/utils";
import { PageTitle } from "@/components/portfolio/kit";
import { DemoSection } from "./demo-section";
import { LimitsSection } from "./limits-section";
import { TeamSection } from "./team-section";
import { TourCard } from "./tour-card";

export { SCENARIOS } from "./demo-section";

type TabId = "sinirlar" | "ekip" | "senaryolar" | "tur";

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: "sinirlar", label: "Sınırlar" },
  { id: "ekip", label: "Ekip ve roller" },
  ...(DEMO_MODE
    ? ([
        { id: "senaryolar", label: "Senaryolar" },
        { id: "tur", label: "Rehberli tur" },
      ] as const)
    : []),
];

/** The tab a URL hash asks for ("/ayarlar#ekip"); the first tab otherwise. */
export function tabFromHash(hash: string): TabId {
  const id = hash.replace(/^#/, "");
  return TABS.find((t) => t.id === id)?.id ?? "sinirlar";
}

/**
 * /ayarlar — four tabs: Sınırlar (two signatures to change), Ekip ve roller (users and who may
 * do what), Senaryolar (Yönetici only) and Rehberli tur. Sign-out lives in the account menu.
 * The open tab is kept in the hash, so "/ayarlar#tur" opens the tour card.
 */
export function SettingsScreen() {
  const [tab, setTab] = useState<TabId>("sinirlar");
  const refs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  useEffect(() => {
    const sync = () => setTab(tabFromHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const select = (id: TabId, focus = false) => {
    setTab(id);
    window.history.replaceState(null, "", id === "sinirlar" ? window.location.pathname : `#${id}`);
    if (focus) refs.current[id]?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex((t) => t.id === tab);
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = TABS[(to + TABS.length) % TABS.length];
    if (next) select(next.id, true);
  };

  return (
    <div className="space-y-6">
      <PageTitle>Ayarlar</PageTitle>
      <div role="tablist" aria-label="Ayarlar bölümleri" onKeyDown={onKey} className="-mx-4 flex gap-1 overflow-x-auto border-b-2 border-hairline px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`sekme-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            className={cn(
              "-mb-[2px] inline-flex h-11 shrink-0 items-center border-b-[3px] px-3 text-ui font-medium whitespace-nowrap transition-colors duration-[var(--dur-quick)]",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
              tab === t.id ? "border-brand text-ink" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`sekme-${tab}`}>
        {tab === "sinirlar" ? <LimitsSection /> : null}
        {tab === "ekip" ? <TeamSection /> : null}
        {tab === "senaryolar" ? <DemoSection /> : null}
        {tab === "tur" ? <TourCard /> : null}
      </div>
    </div>
  );
}
