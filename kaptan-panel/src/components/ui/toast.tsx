"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner, toast as sonnerToast } from "sonner";

/**
 * Toasts are cards laid on top: white panel, a navy-tinted edge and a soft lift — rare on
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
            "pointer-events-auto relative flex min-h-14 w-[420px] max-w-[calc(100vw-24px)] items-start gap-3 rounded-xl border border-line-strong bg-panel py-3 pr-11 pl-3.5 font-sans text-ui text-ink shadow-[var(--shadow-pop)]",
          content: "min-w-0 flex-1",
          title: "font-medium break-words",
          description: "line-clamp-3 break-words text-dense text-ink-soft",
          icon: "mt-px",
          actionButton: "ml-auto shrink-0 self-center rounded-lg bg-brand px-3 py-1.5 text-dense font-semibold text-on-dark transition-[background-color,scale] duration-[var(--dur-quick)] hover:bg-navy-raised active:scale-[0.97]",
          closeButton:
            "absolute top-1.5 right-1.5 grid size-9 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-wash-tint hover:text-ink [&_svg]:size-3.5",
          error: "border-north/60 before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-north",
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
          ? "grid size-6 shrink-0 place-items-center rounded-full bg-north text-meta font-semibold text-on-dark"
          : "grid size-6 shrink-0 place-items-center rounded-full bg-gain text-meta font-semibold text-on-dark"
      }
    >
      {children}
    </span>
  );
}
