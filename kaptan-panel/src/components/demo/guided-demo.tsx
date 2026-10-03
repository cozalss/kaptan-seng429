"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DEMO_MODE } from "@/lib/api/config";
import { ROLE_CODE, ROLE_LABEL } from "@/lib/domain/user";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/primitives";
import { ACT_TITLES, DEMO_BUDGET_S, DEMO_STEPS, fmtClock, isBehind, manualLabel } from "./demo-steps";
import { demoStore, goToStep, nextStep, prevStep, setAutoplay, setMinimized, stopGuidedDemo } from "./demo-store";
import { useDemoRunner } from "./use-demo-runner";

/**
 * Guided demo overlay (FRONTEND-SPEC §7, 11 §2): a presenter rail docked bottom-left that
 * walks steps 1–6. → / ← move between steps (outside text fields and dialogs). Mounted
 * once in the panel layout; renders nothing until started from ⌘K or /admin.
 */
export function GuidedDemo() {
  const s = useSyncExternalStore(demoStore.subscribe, demoStore.get, demoStore.server);
  if (!DEMO_MODE || !s.active) return null;
  return <Rail />;
}

function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

function useClock(startedAt: number): number {
  const [now, setNow] = useState(() => startedAt);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return Math.max(0, now - startedAt);
}

function Rail() {
  const { state, step, status, runManual, roleNow } = useDemoRunner();
  const elapsed = useClock(state.startedAt);
  const behind = isBehind(state.index, elapsed);
  const last = state.index === DEMO_STEPS.length - 1;
  const backup = manualLabel(step.action);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
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

  if (state.minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 left-4 z-40 inline-flex h-10 items-center gap-2 border-[1.5px] border-ink bg-ink px-3 text-dense font-medium text-on-dark shadow-ink lg:left-[calc(var(--sidebar-w)+16px)]"
        aria-label={`Rehberli demoyu aç: adım ${step.id}, ${step.title}`}
      >
        <span aria-hidden className="size-2 bg-on-dark animate-pulse-dot" />
        Demo · {step.id} · {fmtClock(elapsed)}
      </button>
    );
  }

  const acts = [1, 2, 3, 4, 5, 6] as const;

  return (
    <>
      {/* Keeps the page's last lines reachable above the strip. */}
      <div aria-hidden className="h-[230px] sm:h-[150px] lg:h-[120px]" />
      <section
        aria-label="Rehberli demo şeridi"
        className="fixed inset-x-0 bottom-0 z-40 border-t-[1.5px] border-ink bg-panel shadow-[0_-4px_0_var(--ink)] lg:left-[var(--sidebar-w)]"
      >
        {/* Row 1 — where we are: acts, step, role, clock. */}
        <header className="flex h-9 items-center gap-2 bg-ink pr-1 pl-3 text-on-dark">
          <span className="hidden text-meta font-medium whitespace-nowrap md:inline">Rehberli demo</span>
          <ol aria-label="Demo adımları" className="flex items-center gap-1">
            {acts.map((a) => {
              const first = DEMO_STEPS.findIndex((x) => x.act === a);
              const current = step.act === a;
              const done = step.act > a;
              return (
                <li key={a}>
                  <button
                    type="button"
                    onClick={() => goToStep(first)}
                    aria-current={current ? "step" : undefined}
                    title={ACT_TITLES[a]}
                    className={cn(
                      "grid size-6 place-items-center border text-[12px] font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-on-dark",
                      current ? "border-on-dark bg-on-dark text-ink" : done ? "border-on-dark/70 text-on-dark" : "border-on-dark/35 text-on-dark/70 hover:border-on-dark",
                    )}
                  >
                    <span aria-hidden>{done ? "✓" : a}</span>
                    <span className="sr-only">{ACT_TITLES[a]}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <span aria-hidden className="mx-1 hidden h-4 w-px bg-on-dark/30 sm:block" />
          <span className="code shrink-0 text-on-dark/80">{step.id}</span>
          <h2 className="min-w-0 truncate text-dense font-medium">{step.title}</h2>
          <span className="hidden shrink-0 text-meta text-on-dark/70 tabular-nums sm:inline">{step.window}</span>
          {step.role ? (
            <span className="hidden shrink-0 border border-on-dark/60 px-1.5 text-meta leading-[18px] sm:inline" title={`Bu adım ${ROLE_LABEL[step.role]} rolüyle yürür`}>
              <span className="font-medium">{ROLE_CODE[step.role]}</span> {ROLE_LABEL[step.role]}
            </span>
          ) : null}
          <span
            className={cn("ml-auto shrink-0 text-dense font-medium whitespace-nowrap tabular-nums", behind && "underline decoration-2 underline-offset-4")}
            aria-label={`Geçen süre ${fmtClock(elapsed)}, bütçe 5 dakika${behind ? ", plandan geride" : ""}`}
          >
            {fmtClock(elapsed)} / {fmtClock(DEMO_BUDGET_S * 1000)}
            {behind ? <span className="ml-1.5 text-meta font-normal">geride</span> : null}
          </span>
          <button type="button" onClick={() => setMinimized(true)} className="grid size-7 shrink-0 place-items-center text-[16px] leading-none hover:bg-wash" aria-label="Küçült">
            –
          </button>
          <button type="button" onClick={stopGuidedDemo} className="grid size-7 shrink-0 place-items-center text-[18px] leading-none hover:bg-wash" aria-label="Demoyu kapat">
            ×
          </button>
        </header>

        {/* Row 2 — what to say, and the controls. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
          <div className="min-w-[min(100%,320px)] flex-1">
            <p className="border-l-[3px] border-ink pl-3 text-ui text-ink" aria-live="polite">
              {step.note}
            </p>
            {status.busy || status.error || (status.roleMismatch && step.role) ? (
              <p className="mt-1 pl-3.5 text-meta">
                {status.busy ? <span className="text-wash">{status.busy}</span> : null}
                {status.roleMismatch && step.role ? (
                  <span className="font-medium text-ink">
                    {" "}Bu adım {ROLE_LABEL[step.role]} sekmesinde (şu an {ROLE_LABEL[roleNow]}).
                  </span>
                ) : null}
                {status.error ? (
                  <span role="alert" className="font-medium text-north">
                    {" "}{status.error}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={prevStep}
              disabled={state.index === 0}
              className="inline-flex h-8 items-center gap-1.5 border border-rule-soft px-2.5 text-dense text-ink hover:border-ink disabled:opacity-40"
            >
              ‹ Geri <Kbd aria-hidden className="hidden sm:inline-grid">←</Kbd>
            </button>
            <button
              type="button"
              onClick={() => (last ? stopGuidedDemo() : nextStep())}
              className="inline-flex h-8 items-center gap-1.5 border-[1.5px] border-ink bg-ink px-3 text-dense font-medium text-on-dark hover:bg-wash"
            >
              {last ? "Demoyu bitir" : "Sonraki adım"} <Kbd aria-hidden className="hidden border-on-dark/40 bg-transparent text-on-dark sm:inline-grid">→</Kbd>
            </button>
            {backup ? (
              <button
                type="button"
                onClick={() => void runManual()}
                disabled={Boolean(status.busy)}
                className="inline-flex h-8 items-center border border-ink px-2.5 text-dense text-ink hover:bg-wash-tint disabled:opacity-40"
              >
                {backup}
              </button>
            ) : null}
            <span className="px-1 text-meta text-muted tabular-nums">
              {state.index + 1} / {DEMO_STEPS.length}
            </span>
            <button
              type="button"
              aria-pressed={state.autoplay}
              onClick={() => setAutoplay(!state.autoplay)}
              className={cn("inline-flex h-8 items-center border px-2.5 text-dense", state.autoplay ? "border-ink bg-wash-tint font-medium text-ink" : "border-rule-soft text-ink-soft hover:border-ink")}
              title="Yedek oynatma: adımlar planlanan sürelerle kendiliğinden ilerler"
            >
              {state.autoplay ? "Otomatik: açık" : "Otomatik oynat"}
            </button>
          </div>
        </div>
        <div aria-hidden className="flex h-1">
          {DEMO_STEPS.map((x, i) => (
            <span key={x.id} className={cn("flex-1", i < state.index ? "bg-ink" : i === state.index ? "bg-wash" : "bg-hairline")} />
          ))}
        </div>
      </section>
    </>
  );
}
