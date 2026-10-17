"use client";

import { ROLE_LABEL, type Role } from "@/lib/domain/user";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RoleEmblem } from "@/components/roles/role-emblem";
import { DEMO_STEPS, type DemoStep } from "./demo-steps";
import "./tour-bar.css";

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
 * The guided tour's bar at the foot of the page: a thin progress line, "Adım n/15", the step's
 * title and one-line note, whose eyes we look through, and ← · Sonraki → · close on the right.
 */
export function TourInstrument({ index, step, role, busy, error, manual, onBackup, onPrev, onNext, onClose }: TourInstrumentProps) {
  const last = index === DEMO_STEPS.length - 1;
  const total = DEMO_STEPS.length;
  return (
    <section aria-label="Rehberli tur" data-testid="guided-demo" className="tour-rise fixed inset-x-0 bottom-0 z-40 border-t-2 border-hairline bg-panel shadow-[0_-4px_16px_rgb(16_17_23/0.12)]">
      <div aria-hidden className="h-[3px] bg-sunk">
        <div className="h-full origin-left bg-brand transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)]" style={{ transform: `scaleX(${(index + 1) / total})` }} />
      </div>
      <div className="mx-auto flex max-w-[752px] flex-col gap-3 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:py-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta text-muted">
            <span className="font-semibold text-ink tabular-nums">
              Adım {index + 1}/{total}
            </span>
            <span aria-live="polite" className={cn(`tone-${role}`, "inline-flex items-center gap-1.5")}>
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
            </span>
          </p>
          <p key={step.id} className="animate-fade-in mt-0.5 text-[17px] leading-6 font-semibold text-ink" data-testid="demo-step-title">
            {step.title}
          </p>
          <p className="mt-0.5 line-clamp-2 max-w-[680px] text-dense text-ink-soft">{step.note}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {manual ? (
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={onBackup}>
              {manual.label}
            </Button>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
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
    </section>
  );
}
