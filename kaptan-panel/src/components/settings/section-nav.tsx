"use client";

import type { MouseEvent, ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/utils";

/**
 * Every Ayarlar section can take focus (tabIndex -1) and stops clear of the sticky top bar,
 * so a jump from "Bu sayfada" lands the reader — and a screen reader — on its heading.
 */
export const SECTION = { tabIndex: -1, className: "scroll-mt-20 space-y-6 outline-none sm:scroll-mt-28" } as const;

export interface SectionLink {
  id: string;
  label: string;
}

/** Scroll to a section and move focus there (the hash still updates for sharing). */
function jump(e: MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  e.preventDefault();
  if (typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  target.focus({ preventScroll: true });
  window.history.replaceState(null, "", `#${id}`);
}

/**
 * "Bu sayfada": the page's table of contents, set as a ruled line under the title. Each link
 * is a 44px target; the arrow slides a step on hover, the way a finger points down a page.
 */
export function SectionNav({ links }: { links: readonly SectionLink[] }) {
  return (
    <nav aria-label="Bu sayfada" className="flex flex-wrap items-center gap-x-6 border-y-2 border-ink">
      <span aria-hidden className="hidden text-meta text-muted sm:inline">
        Bu sayfada
      </span>
      {links.map((l) => (
        <a
          key={l.id}
          href={`#${l.id}`}
          onClick={(e) => jump(e, l.id)}
          className="group inline-flex min-h-11 items-center gap-1.5 text-ui text-ink-soft transition-colors duration-[var(--dur-quick)] hover:text-ink"
        >
          <span className="underline decoration-rule-ui underline-offset-4 transition-[text-decoration-color] duration-[var(--dur-quick)] group-hover:decoration-ink">{l.label}</span>
          <span aria-hidden className="text-muted transition-transform duration-[var(--dur-quick)] ease-[var(--ease-ink)] group-hover:translate-y-[2px] group-hover:text-ink">
            ↓
          </span>
        </a>
      ))}
    </nav>
  );
}

/** A section's head: its name in the Bodoni text cut and the one plain sentence under it. */
export function SectionHead({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 id={id} className="font-display-text text-title text-ink">
        {title}
      </h2>
      <p className="max-w-[600px] text-body text-ink-soft">{children}</p>
    </div>
  );
}
