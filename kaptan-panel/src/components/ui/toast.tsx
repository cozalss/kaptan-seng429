"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner, toast as sonnerToast } from "sonner";

/**
 * Toasts are printed slips laid on top: paper panel, ink border, hard shadow — rare on
 * purpose (a proposal arriving while you are elsewhere, an error). Bottom centre, long enough
 * to read (6 s; errors 10 s; a slip with an action 12 s), keyed by title so a repeat replaces
 * itself, and always closable. Use `notify.*`, never sonner directly. The <Toaster/> lives in
 * the panel shell only, so the sign-in pages never load sonner.
 */
export const TOAST_MS = 6_000;
const ERROR_MS = 10_000;
const ACTION_MS = 12_000;

export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      visibleToasts={2}
      gap={6}
      duration={TOAST_MS}
      offset={{ bottom: 20 }}
      mobileOffset={{ bottom: 12, left: 12, right: 12 }}
      containerAriaLabel="Bildirimler"
      className="kaptan-toaster"
      closeButton
      style={{ "--width": "420px" } as CSSProperties}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: "Bildirimi kapat",
        classNames: {
          toast:
            "pointer-events-auto relative flex min-h-12 w-[420px] max-w-[calc(100vw-24px)] items-start gap-3 border-2 border-ink bg-panel py-2.5 pr-11 pl-3 shadow-ink font-sans text-ui text-ink",
          content: "min-w-0 flex-1",
          title: "font-medium break-words",
          description: "line-clamp-3 break-words text-dense text-ink-soft",
          icon: "mt-px",
          actionButton: "ml-auto shrink-0 self-center border-2 border-ink bg-ink px-2.5 py-1 text-dense font-medium text-on-dark hover:bg-ink-lift",
          closeButton:
            "absolute top-1 right-1 grid size-9 place-items-center text-ink-soft hover:bg-wash-tint hover:text-ink [&_svg]:size-3.5",
          error: "border-north",
        },
      }}
    />
  );
}

/** Same title → same toast id: a burst of identical events shows once. */
const idFor = (title: string) => `t:${title}`;

export const notify = {
  info: (title: string, description?: string, opts: { duration?: number } = {}) =>
    sonnerToast(title, { id: idFor(title), description, duration: opts.duration }),
  success: (title: string, description?: string) =>
    sonnerToast.success(title, { id: idFor(title), description, icon: <Mark>✓</Mark> }),
  error: (title: string, description?: string) =>
    sonnerToast.error(title, { id: idFor(title), description, icon: <Mark critical>!</Mark>, duration: ERROR_MS }),
  /** Desk events (fills, approvals) — includes an optional action, e.g. "İncele". */
  event: (title: string, description: string | undefined, action?: { label: string; onClick: () => void }) =>
    sonnerToast(title, {
      id: idFor(title),
      description,
      duration: action ? ACTION_MS : undefined,
      action: action ? { label: action.label, onClick: action.onClick } : undefined,
    }),
};

function Mark({ children, critical = false }: { children: string; critical?: boolean }) {
  return (
    <span
      aria-hidden
      className={
        critical
          ? "grid size-5 shrink-0 place-items-center border-2 border-north bg-north text-meta font-medium text-on-dark"
          : "grid size-5 shrink-0 place-items-center border-2 border-ink text-meta text-ink"
      }
    >
      {children}
    </span>
  );
}
