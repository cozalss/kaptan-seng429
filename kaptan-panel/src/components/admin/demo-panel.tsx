"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DEMO_MODE, IS_MOCK } from "@/lib/api/config";
import { can, deniedHint } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/session-context";
import { fmtInt } from "@/lib/format";
import { AUDIT_TAMPER_POS, DEMO_SCENARIOS } from "@/mocks/ids";
import { Button } from "@/components/ui/button";
import { FixtureBadge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/primitives";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { notify } from "@/components/ui/toast";
import { ACT_TITLES, DEMO_STEPS, fmtClock, totalAutoplaySeconds } from "@/components/demo/demo-steps";
import { startGuidedDemo } from "@/components/demo/demo-store";
import { useDesk } from "@/components/shell/desk-state";
import { useAction } from "./use-action";

/**
 * Demo controls (FR-40, 11 §2–4): the guided 5-minute run, single scenario injections
 * (`inject_disclosure`, Admin, demo only) and the demo data reset. Everything injected is
 * stamped "DEMO FİKSTÜRÜ" and never passes as live.
 */
export function DemoPanel() {
  const user = useSession();
  const router = useRouter();
  const act = useAction();
  const desk = useDesk();
  const allowed = DEMO_MODE && can(user.role, "demo_inject");
  const reason = !DEMO_MODE ? "Demo modu kapalı: enjeksiyon yalnızca demo ortamında açılır." : deniedHint("demo_inject");

  const inject = async (id: (typeof DEMO_SCENARIOS)[number]["id"], label: string) => {
    const r = await act.run((api) => api.injectDemo(id));
    if (!r.ok) {
      notify.error("Senaryo çalışmadı", r.error);
      return;
    }
    notify.info(`Senaryo: ${label}`, "DEMO FİKSTÜRÜ enjekte edildi.");
    if (r.value.run_id) router.push(`/runs/${r.value.run_id}`);
    else if (id === "loss_simulation") router.push("/portfolio");
  };

  const resetAndStart = async () => {
    const r = await act.run((api) => api.resetDemo());
    if (!r.ok) {
      notify.error("Sıfırlanamadı", r.error);
      return;
    }
    // Screens keep mock data in memory: remount them and refetch the shell (as in ⌘K).
    desk.resetView();
    startGuidedDemo();
    router.push("/inbox");
  };

  const acts = [1, 2, 3, 4, 5, 6] as const;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Panel raised aria-labelledby="guided-title">
        <header className="flex flex-wrap items-start gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-meta text-muted">Final sunumu · 11-demo-senaryosu §2</p>
            <h2 id="guided-title" className="font-display text-[30px] leading-tight text-ink">
              Rehberli demo
            </h2>
            <p className="mt-1 max-w-prose text-ui text-ink-soft">
              Tek yerden 5 dakika: her adım doğru ekrana gider, gereken rolü seçer, senaryoyu enjekte eder ve sunucuya tek satırlık not verir. <Kbd>→</Kbd> sonraki adım. Ağ yoksa “Otomatik oynat” yedek oynatmadır.
            </p>
          </div>
          <FixtureBadge />
        </header>
        <ol className="grid grid-cols-2 border-b border-hairline sm:grid-cols-3">
          {acts.map((a) => {
            const steps = DEMO_STEPS.filter((s) => s.act === a);
            return (
              <li key={a} className="border-r border-b border-hairline px-4 py-3 last:border-r-0 sm:[&:nth-child(3n)]:border-r-0">
                <span className="flex items-baseline gap-2">
                  <span className="font-display text-[26px] leading-none text-ink">{a}</span>
                  <span className="text-dense font-medium text-ink">{ACT_TITLES[a]}</span>
                </span>
                <span className="mt-1 block text-meta text-muted">
                  {steps[0]?.window.split("–")[0]} · {steps.length} adım
                </span>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <Button variant="primary" size="lg" disabled={!allowed} onClick={() => startGuidedDemo()}>
            Rehberli demoyu başlat
          </Button>
          {IS_MOCK ? (
            <Button variant="outline" size="lg" disabled={!allowed || act.pending} onClick={() => void resetAndStart()}>
              Sıfırla ve baştan başlat
            </Button>
          ) : null}
          <span className="text-meta text-muted">
            {DEMO_STEPS.length} adım · otomatik oynatma {fmtClock(totalAutoplaySeconds() * 1000)} · ⌘K → “Rehberli demo”
          </span>
          {!allowed ? <p className="basis-full text-meta text-muted">{reason}</p> : null}
        </div>
      </Panel>

      <div className="space-y-6">
        <Panel aria-labelledby="inject-title">
          <PanelHeader id="inject-title" title="Tek senaryo enjekte et" meta="inject_disclosure · yalnızca Admin, yalnızca demo ortamı" />
          <ul className="divide-y divide-hairline">
            {DEMO_SCENARIOS.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-dense font-medium text-ink">{s.label}</span>
                  <span className="code block text-meta text-muted">
                    {s.step} · {s.id}
                  </span>
                </span>
                <Button size="sm" variant="secondary" disabled={!allowed || act.pending} onClick={() => void inject(s.id, s.label)}>
                  Enjekte et
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel aria-labelledby="tamper-title">
          <PanelHeader id="tamper-title" title="Kurcalama testi" meta={`Demo veritabanında kayıt #${fmtInt(AUDIT_TAMPER_POS)} değiştirilir; doğrulama kırığı bulur.`} />
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Button asChild size="sm" variant="danger-outline">
              <Link href="/audit">Denetim kaydında aç</Link>
            </Button>
            <span className="text-meta text-muted">Test sonrası “Kurcalamayı geri al” ile özgün hale döner.</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
