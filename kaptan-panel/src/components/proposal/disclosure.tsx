"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * One secondary section of an Öneri, closed by default (the WAI accordion pattern: an h2 holding
 * a button with aria-expanded, the panel under it). The heading's name is the title alone; the
 * quiet meta line under it is part of the same click target (the button's ::after covers the row).
 */
export function Disclosure({
  id,
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section id={id} className="border-b border-hairline last:border-b-0">
      <div className="relative flex min-h-16 items-center gap-4 px-5 py-3 transition-colors duration-[var(--dur-quick)] has-[button:hover]:bg-wash-tint/50 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] leading-6 font-semibold text-ink">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((o) => !o)}
              className="cursor-pointer text-left outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-brand"
            >
              {title}
            </button>
          </h2>
          {meta ? <p className="mt-0.5 text-dense text-muted tabular-nums">{meta}</p> : null}
        </div>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className={`size-4 shrink-0 text-ink transition-transform duration-[var(--dur-quick)] ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M3.5 6l4.5 4.5L12.5 6" />
        </svg>
      </div>
      <div id={panelId} hidden={!open} className="px-5 pt-1 pb-6 sm:px-6">
        {children}
      </div>
    </section>
  );
}
