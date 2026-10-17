"use client";

import { ROLE_LABEL, type Role } from "@/lib/domain/user";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RoleEmblem } from "@/components/roles/role-emblem";
import { ACT_TITLES, actPosition, DEMO_STEPS, type DemoStep } from "./demo-steps";
import "./tour-bar.css";

const ACTS = [1, 2, 3, 4, 5, 6] as const;

/**
 * The course ruler along the bar's top edge: one tick per step, grouped by act (a wider gap
 * between acts). Walked steps are ink, the current one stands taller, the rest are hairlines.
 */
function CourseRuler({ index }: { index: number }) {
  return (
    <div aria-hidden className="flex items-end gap-3 sm:gap-4">
      {ACTS.map((act) => (
        <span key={act} className="flex flex-1 items-end gap-[3px]">
          {DEMO_STEPS.map((s, i) =>
            s.act === act ? (
              <span
                key={s.id}
                className={cn(
                  "h-[6px] flex-1 origin-bottom transition-[scale,background-color] duration-[var(--dur-base)] ease-[var(--ease-ink)]",
                  i === index ? "bg-ink" : i < index ? "scale-y-50 bg-ink" : "scale-y-50 bg-rule-soft",
                )}
              />
            ) : null,
          )}
        </span>
      ))}
    </div>
  );
}

function Cross() {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" />
    </svg>
  );
}

export interface TourInstrumentProps {
  index: number;
  step: DemoStep;
  role: Role;
  busy: string | null;
  error: string | null;
  manual: { label: string } | null;
  onBackup: () => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

/**
 * The guided tour's bar, drawn as a ship's instrument laid over the foot of the page: the
 * course ruler on top, the act and step in words (the step's title in Bodoni, inked in on
 * every step), whose eyes we look through in that role's ink, and the helm on the right:
 * ← · Sonraki → · close. It rises once when the tour starts; nothing else moves.
 */
export function TourInstrument({ index, step, role, busy, error, manual, onBackup, onPrev, onNext, onClose }: TourInstrumentProps) {
  const pos = actPosition(index);
  const last = index === DEMO_STEPS.length - 1;
  return (
    <section aria-label="Rehberli tur" data-testid="guided-demo" className="tour-rise fixed inset-x-0 bottom-0 z-40 border-t-[1.5px] border-ink bg-panel shadow-[0_-4px_0_var(--ink)]">
      <div className="mx-auto max-w-[960px] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6 sm:pt-4 sm:pb-4">
        <CourseRuler index={index} />
        <div className="mt-3 flex flex-col gap-3 sm:mt-4 sm:flex-row sm:items-end sm:gap-8">
          <div className="min-w-0 flex-1">
            <p className="text-meta text-muted">
              <span className="font-medium text-ink">Perde {pos.act}/6</span> · {ACT_TITLES[pos.act]}
            </p>
            <p key={step.id} className="animate-ink-in mt-1 font-display-text text-lead text-balance text-ink sm:text-[24px] sm:leading-[30px]" data-testid="demo-step-title">
              {step.title}
            </p>
            <p className="mt-1 max-w-[620px] text-dense text-ink-soft">{step.note}</p>
            <p aria-live="polite" className={cn(`tone-${role}`, "mt-2 flex min-h-4 items-center gap-1.5 text-meta text-muted")}>
              {error ? (
                <span className="text-north">{error}</span>
              ) : busy ? (
                <span>{busy}</span>
              ) : (
                <>
                  <RoleEmblem role={role} className="size-[12px] shrink-0 text-[var(--tone)]" />
                  <span>Rol: {ROLE_LABEL[role]}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 max-sm:justify-between">
            {manual ? (
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={onBackup}>
                {manual.label}
              </Button>
            ) : null}
            <div className="flex items-center gap-2 max-sm:ml-auto">
              <span className="mr-1 text-dense text-muted tabular-nums">
                <span className="text-ink">{index + 1}</span>/{DEMO_STEPS.length}
              </span>
              <Button variant="secondary" size="icon" aria-label="Önceki adım" disabled={index === 0} onClick={onPrev}>
                ←
              </Button>
              <Button variant="primary" className="max-sm:h-11" aria-label={last ? "Turu bitir" : "Sonraki adım"} onClick={onNext}>
                {last ? "Bitir" : "Sonraki"} <span aria-hidden>{last ? "✓" : "→"}</span>
              </Button>
              <Button variant="ghost" size="icon" aria-label="Rehberli turu kapat" onClick={onClose}>
                <Cross />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
