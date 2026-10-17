"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ROLE_LABEL, type Role } from "@/lib/domain/user";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { notify } from "@/components/ui/toast";
import { useRole } from "@/components/roles/use-role";
import { useDesk } from "@/components/shell/desk-state";
import { runAction, until } from "./demo-actions";
import { DEMO_STEPS, manualAction, routePath, type DemoStep } from "./demo-steps";
import { demoStore, nextStep, prevStep, stopGuidedDemo } from "./demo-store";
import { TourInstrument } from "./tour-instrument";

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * The guided tour's bar, loaded only once a tour starts (guided-demo.tsx): an instrument at
 * the bottom (tour-instrument.tsx) that walks the six acts with → / ←. Entering a step switches the role if needed,
 * runs what must happen first, opens the screen and then runs what happens on arrival.
 */
export default function GuidedDemoBar({ index, nonce }: { index: number; nonce: number }) {
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

  const last = index === DEMO_STEPS.length - 1;

  return (
    <>
      <div aria-hidden className="h-52 sm:h-32" />
      <TourInstrument
        index={index}
        step={step}
        role={role}
        busy={busy}
        error={error}
        manual={manual}
        onBackup={() => void backup()}
        onPrev={() => prevStep()}
        onNext={() => (last ? stopGuidedDemo() : nextStep())}
        onClose={() => stopGuidedDemo()}
      />
    </>
  );
}
