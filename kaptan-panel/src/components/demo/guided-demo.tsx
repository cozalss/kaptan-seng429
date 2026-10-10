"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ROLE_LABEL, type Role } from "@/lib/domain/user";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { useRole } from "@/components/roles/use-role";
import { useDesk } from "@/components/shell/desk-state";
import { runAction, until } from "./demo-actions";
import { ACT_TITLES, actPosition, DEMO_STEPS, manualAction, routePath, type DemoStep } from "./demo-steps";
import { demoStore, nextStep, prevStep, stopGuidedDemo } from "./demo-store";

/**
 * Rehberli demo — a small bar at the bottom that walks the six acts with → / ←. Entering a
 * step switches the role if needed, runs what must happen first, opens the screen and then
 * runs what happens on arrival. One line per step for the presenter.
 */
export function GuidedDemo() {
  const s = useSyncExternalStore(demoStore.subscribe, demoStore.get, demoStore.server);
  if (!s.active) return null;
  return <Bar index={s.index} nonce={s.nonce} />;
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

function Bar({ index, nonce }: { index: number; nonce: number }) {
  const step = DEMO_STEPS[index] as DemoStep;
  const api = useApi();
  const router = useRouter();
  const pathname = usePathname();
  const desk = useDesk();
  const { role, switchTo } = useRole();
  const apiRef = useLatest(api);
  const roleRef = useLatest(role);
  const pathRef = useLatest(pathname);
  const switchRef = useLatest(switchTo);
  const deskRef = useLatest(desk);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const played = useRef(-1);

  const becomeRole = useCallback(
    async (r: Role) => {
      if (roleRef.current === r) return true;
      if (!(await switchRef.current(r, { quiet: true }))) return false;
      return until(() => roleRef.current === r, 3_000);
    },
    [roleRef, switchRef],
  );

  // Play the step once per entry (nonce): role → "before" → open the screen → "after".
  useEffect(() => {
    if (played.current === nonce) return;
    played.current = nonce;
    const current = () => demoStore.get().active && demoStore.get().nonce === nonce;
    void (async () => {
      setError(null);
      try {
        for (const a of step.actions ?? []) {
          if (a.when !== "before") continue;
          const as = "as" in a && a.as ? a.as : step.role;
          if (as) {
            setBusy(`${ROLE_LABEL[as]} gözüyle…`);
            await becomeRole(as);
          }
          setBusy("Hazırlanıyor…");
          await runAction(apiRef.current, a);
          if (a.kind === "reset") deskRef.current.resetView();
          if (!current()) return;
        }
        if (step.role) {
          setBusy(`${ROLE_LABEL[step.role]} gözüyle…`);
          await becomeRole(step.role);
        }
        if (!current()) return;
        router.push(step.route);
        await until(() => pathRef.current === routePath(step.route), 8_000);
        for (const a of step.actions ?? []) {
          if (a.when !== "after" || !current()) continue;
          setBusy("Sahnede…");
          await new Promise((r) => setTimeout(r, 350));
          await runAction(apiRef.current, a);
        }
      } catch (e) {
        if (current()) setError(errorMessage(e));
      } finally {
        if (current()) setBusy(null);
      }
    })();
  }, [nonce, step, router, apiRef, pathRef, deskRef, becomeRole]);

  // → / ← walk the steps (not while typing or inside a dialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]") !== null)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        nextStep();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevStep();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const manual = manualAction(step);
  const backup = async () => {
    if (!manual) return;
    setBusy("Yedek çalışıyor…");
    setError(null);
    try {
      const msg = await runAction(apiRef.current, manual.action);
      await deskRef.current.refresh();
      router.refresh();
      if (msg) notify.success(msg);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const pos = actPosition(index);
  const last = index === DEMO_STEPS.length - 1;

  return (
    <>
      <div aria-hidden className="h-52 sm:h-40" />
      <section
        aria-label="Rehberli demo"
        data-testid="guided-demo"
        className="fixed inset-x-0 bottom-0 z-40 border-t-[1.5px] border-ink bg-panel shadow-[0_-3px_0_var(--ink)]"
      >
        <div className="mx-auto flex max-w-[960px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[12px] tracking-[0.02em] text-muted">
              Rehberli demo · Perde {pos.act}/6 · {ACT_TITLES[pos.act]} · <span className="tabular-nums">Adım {index + 1}/{DEMO_STEPS.length}</span>
            </p>
            <p className="text-[16px] leading-[22px] font-medium text-ink" data-testid="demo-step-title">
              {step.title}
            </p>
            <p className="text-[14px] leading-[20px] text-ink-soft">{step.note}</p>
            <p aria-live="polite" className="min-h-[18px] text-[12px] text-muted">
              {error ? <span className="text-north">{error}</span> : (busy ?? `Rol: ${ROLE_LABEL[role]}`)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {manual ? (
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void backup()}>
                {manual.label}
              </Button>
            ) : null}
            <Button variant="secondary" size="icon" aria-label="Önceki adım" disabled={index === 0} onClick={() => prevStep()}>
              ←
            </Button>
            <Button variant="primary" size="icon" aria-label={last ? "Demoyu bitir" : "Sonraki adım"} onClick={() => (last ? stopGuidedDemo() : nextStep())}>
              {last ? "✓" : "→"}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Rehberli demoyu kapat" onClick={() => stopGuidedDemo()}>
              ×
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
