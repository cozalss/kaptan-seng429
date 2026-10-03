"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner, toast as sonnerToast } from "sonner";
import { IS_MOCK } from "@/lib/api/config";

/**
 * Toasts are printed slips: paper panel, ink border, hard shadow. On desktop they are laid
 * over the top bar's left half (session clock and counters: ambient, never an action), so a
 * toast never covers a screen's content, its primary actions (approval bar, kill switch,
 * charts) or the demo strip at the bottom. One line each, short-lived (4 s; errors 6 s) and
 * keyed by title, so a repeated message replaces itself instead of stacking. Use `notify.*`
 * — never call sonner directly — so tone stays consistent.
 */
const RIBBON_PX = IS_MOCK ? 28 : 0; // --ribbon-h (globals.css)
const SIDEBAR_PX = 232; // --sidebar-w
export const TOAST_MS = 4_000;
const ERROR_MS = 6_000;

export function Toaster() {
  return (
    <Sonner
      position="top-left"
      visibleToasts={3}
      gap={6}
      duration={TOAST_MS}
      offset={{ top: RIBBON_PX + 4, left: SIDEBAR_PX + 12 }}
      mobileOffset={{ top: RIBBON_PX + 4, left: 8, right: 8 }}
      containerAriaLabel="Bildirimler"
      className="kaptan-toaster"
      style={{ "--width": "440px" } as CSSProperties}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "pointer-events-auto flex min-h-12 w-[440px] max-w-[calc(100vw-16px)] items-center gap-3 border-[1.5px] border-ink bg-panel px-3 py-1.5 shadow-ink font-sans text-ui text-ink",
          content: "min-w-0 flex-1",
          title: "truncate font-medium leading-5",
          description: "truncate text-dense text-ink-soft",
          actionButton: "ml-auto shrink-0 border border-ink bg-ink px-2 py-1 text-meta font-medium text-on-dark",
          error: "border-north",
        },
      }}
    />
  );
}

/** Same title → same toast id: a burst of identical events shows once. */
const idFor = (title: string) => `t:${title}`;

export const notify = {
  info: (title: string, description?: string) => sonnerToast(title, { id: idFor(title), description }),
  success: (title: string, description?: string) =>
    sonnerToast.success(title, { id: idFor(title), description, icon: <Mark>✓</Mark> }),
  error: (title: string, description?: string) =>
    sonnerToast.error(title, { id: idFor(title), description, icon: <Mark critical>!</Mark>, duration: ERROR_MS }),
  /** Desk events (fills, approvals) — includes an optional action, e.g. "Aç". */
  event: (title: string, description: string | undefined, action?: { label: string; onClick: () => void }) =>
    sonnerToast(title, {
      id: idFor(title),
      description,
      action: action ? { label: action.label, onClick: action.onClick } : undefined,
    }),
};

function Mark({ children, critical = false }: { children: string; critical?: boolean }) {
  return (
    <span
      aria-hidden
      className={
        critical
          ? "grid size-5 shrink-0 place-items-center border border-north bg-north text-[12px] font-semibold text-on-dark"
          : "grid size-5 shrink-0 place-items-center border border-ink text-[12px] text-ink"
      }
    >
      {children}
    </span>
  );
}
