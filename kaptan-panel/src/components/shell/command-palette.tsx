"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { routesFor, PANEL_ROUTES } from "@/lib/auth/routes";
import { can } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/session-context";
import { Role, ROLE_LABEL } from "@/lib/domain/user";
import { IS_MOCK } from "@/lib/api/config";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { DEMO_E3_RUN, DEMO_INJ_RUN, DEMO_R04_RUN, DEMO_SCENARIOS, type DemoScenario } from "@/mocks/ids";
import { notify } from "@/components/ui/toast";
import { Kbd } from "@/components/ui/primitives";
import { useDesk } from "./desk-state";
import { logout, switchRole } from "./session-actions";
import { startGuidedDemo } from "@/components/demo/demo-store";

const itemCls =
  "flex h-10 cursor-pointer items-center gap-3 px-3 text-ui text-ink-soft aria-selected:bg-wash-tint aria-selected:text-ink data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50";
const groupCls = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-meta [&_[cmdk-group-heading]]:text-muted";

/** ⌘K / Ctrl+K command palette, plus "g <key>" go-to shortcuts outside text fields. */
const DEMO_RUN_LINKS: ReadonlyArray<{ id: string; label: string; scenario: DemoScenario; scenarioLabel: string }> = [
  { id: DEMO_E3_RUN, label: "Neden bu işlem? — ÖRNEK ENERJİ (E3)", scenario: "e3_contract", scenarioLabel: "E3: Yeni iş ilişkisi" },
  { id: DEMO_INJ_RUN, label: "Red-team: gizli talimat (DMOGD)", scenario: "redteam_injection", scenarioLabel: "Red-team: gizli talimat" },
  { id: DEMO_R04_RUN, label: "Tedbirli hisse, R04 (TMSLJ)", scenario: "restricted_r04", scenarioLabel: "Tedbirli hisse" },
];

/** Which demo runs exist right now (injected), checked each time the palette opens. */
function useStartedDemoRuns(open: boolean): Set<string> | null {
  const api = useApi();
  const [ids, setIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    api
      .listRuns()
      .then((runs) => {
        if (alive) setIds(new Set(runs.map((r) => r.run_id)));
      })
      .catch(() => {
        if (alive) setIds(null);
      });
    return () => {
      alive = false;
    };
  }, [api, open]);
  return ids;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useSession();
  const api = useApi();
  const desk = useDesk();
  const goPending = useRef<number | null>(null);

  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
        return;
      }
      if (open || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "g") {
        goPending.current = window.setTimeout(() => (goPending.current = null), 900);
        return;
      }
      if (goPending.current !== null) {
        window.clearTimeout(goPending.current);
        goPending.current = null;
        const route = routesFor(user.role).find((r) => r.goKey === e.key.toLowerCase());
        if (route) {
          e.preventDefault();
          router.push(route.href);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, router, user.role]);

  const run = (fn: () => void | Promise<void>) => {
    onOpenChange(false);
    void Promise.resolve(fn()).catch((e: unknown) => notify.error("İşlem yapılamadı", errorMessage(e)));
  };

  const canDemo = can(user.role, "demo_inject");
  const startedRuns = useStartedDemoRuns(open);

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-scrim" />
        <D.Content className="fixed top-[14vh] left-1/2 z-50 w-[calc(100vw-32px)] max-w-[600px] -translate-x-1/2 border-[1.5px] border-ink bg-panel shadow-ink-lg outline-none data-[state=open]:animate-ink-in">
          <D.Title className="sr-only">Komut paleti</D.Title>
          <D.Description className="sr-only">Ekranlara git, demo senaryosu çalıştır, rol değiştir.</D.Description>
          <Command label="Komut paleti" loop>
            <div className="flex items-center gap-3 border-b-[1.5px] border-ink px-3">
              <svg aria-hidden width="15" height="15" viewBox="0 0 13 13">
                <circle cx="5.5" cy="5.5" r="4.3" fill="none" stroke="var(--ink)" strokeWidth="1.4" />
                <path d="M8.7 8.7 12 12" stroke="var(--ink)" strokeWidth="1.4" />
              </svg>
              <Command.Input placeholder="Ekran, komut veya demo adımı…" className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted" />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto pb-2">
              <Command.Empty className="px-3 py-6 text-ui text-muted">Sonuç yok.</Command.Empty>
              <Command.Group heading="Git" className={groupCls}>
                {PANEL_ROUTES.map((r) => {
                  const allowed = r.roles.includes(user.role);
                  return (
                    <Command.Item key={r.href} value={`git ${r.label} ${r.hint}`} disabled={!allowed} onSelect={() => run(() => router.push(r.href))} className={itemCls}>
                      <span className="flex-1">
                        <span className="text-ink">{r.label}</span>
                        <span className="ml-2 text-meta text-muted">{allowed ? r.hint : "Rolünüze kapalı"}</span>
                      </span>
                      <Kbd>g</Kbd>
                      <Kbd>{r.goKey}</Kbd>
                    </Command.Item>
                  );
                })}
              </Command.Group>
              <Command.Group heading="Demo çalıştırmaları" className={groupCls}>
                {DEMO_RUN_LINKS.map((r) => {
                  const started = startedRuns?.has(r.id) ?? true;
                  return (
                    <Command.Item
                      key={r.id}
                      value={`run ${r.label}`}
                      onSelect={() =>
                        run(async () => {
                          // Not injected yet: the Admin starts it in one step; others land on the explained waiting page.
                          if (!started && canDemo) {
                            await api.injectDemo(r.scenario);
                            notify.info(`Senaryo: ${r.scenarioLabel}`, "DEMO FİKSTÜRÜ enjekte edildi.");
                          }
                          router.push(`/runs/${r.id}`);
                        })
                      }
                      className={itemCls}
                    >
                      <span className="flex-1 text-ink">{r.label}</span>
                      {started ? (
                        <span className="code text-muted">{r.id}</span>
                      ) : (
                        <span className="text-meta text-muted">{canDemo ? "başlat ve aç" : "henüz başlamadı"}</span>
                      )}
                    </Command.Item>
                  );
                })}
              </Command.Group>
              {canDemo ? (
                <Command.Group heading="Senaryo (Admin, demo modu)" className={groupCls}>
                  <Command.Item value="rehberli demo başlat sunum 5 dakika" onSelect={() => run(() => startGuidedDemo())} className={itemCls}>
                    <span className="flex-1 text-ink">Rehberli demoyu başlat</span>
                    <span className="text-meta text-muted">Adım 1–6 · →</span>
                  </Command.Item>
                  {DEMO_SCENARIOS.map((s) => (
                    <Command.Item
                      key={s.id}
                      value={`senaryo ${s.label} ${s.step}`}
                      onSelect={() =>
                        run(async () => {
                          const r = await api.injectDemo(s.id);
                          notify.info(`Senaryo: ${s.label}`, "DEMO FİKSTÜRÜ enjekte edildi.");
                          if (r.run_id) router.push(`/runs/${r.run_id}`);
                          else if (s.id === "loss_simulation") router.push("/portfolio");
                        })
                      }
                      className={itemCls}
                    >
                      <span className="flex-1 text-ink">{s.label}</span>
                      <span className="text-meta text-muted">{s.step}</span>
                    </Command.Item>
                  ))}
                  <Command.Item
                    value="senaryo demo verisini sıfırla baştan"
                    onSelect={() =>
                      run(async () => {
                        await api.resetDemo();
                        notify.info("Demo verisi sıfırlandı", "Saat 13:40'a döndü; tüm demo kararları silindi.");
                        // Screens keep mock data in memory: remount them and refetch the shell.
                        desk.resetView();
                        router.push("/inbox");
                      })
                    }
                    className={itemCls}
                  >
                    <span className="flex-1 text-ink">Demo verisini sıfırla</span>
                    <span className="text-meta text-muted">13:40</span>
                  </Command.Item>
                </Command.Group>
              ) : null}
              {IS_MOCK ? (
                <Command.Group heading="Rol (yalnızca mock)" className={groupCls}>
                  {Role.options
                    .filter((r) => r !== user.role)
                    .map((r) => (
                      <Command.Item
                        key={r}
                        value={`rol ${ROLE_LABEL[r]}`}
                        onSelect={() =>
                          run(async () => {
                            const res = await switchRole(r, pathname);
                            if (res.ok) {
                              router.push(res.next);
                              router.refresh();
                            }
                          })
                        }
                        className={itemCls}
                      >
                        <span className="flex-1 text-ink">{ROLE_LABEL[r]} olarak devam et</span>
                      </Command.Item>
                    ))}
                </Command.Group>
              ) : null}
              <Command.Group heading="Oturum" className={groupCls}>
                <Command.Item value="çıkış yap oturumu kapat" onSelect={() => run(async () => router.push(await logout()))} className={itemCls}>
                  <span className="flex-1 text-ink">Çıkış yap</span>
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
