import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CalmSea } from "./calm-sea";

/**
 * The frame both login screens share: one way back (a plain <a>, so the
 * cross-document view transition in login.css runs), the page, and the calm sea low under it.
 * `className` carries the role tone on a door's own screen.
 */
export function LoginFrame({ back, children, className }: { back: { href: string; label: string }; children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative flex min-h-dvh flex-col overflow-x-clip bg-paper", className)}>
      <div className="mx-auto flex w-full max-w-[1200px] items-center px-4 pt-3 sm:px-8">
        <a href={back.href} className="group inline-flex min-h-11 items-center gap-1.5 text-[14px] text-ink-soft hover:text-ink">
          <span aria-hidden className="transition-transform duration-[var(--dur-quick)] group-hover:-translate-x-0.5">
            ←
          </span>
          {back.label}
        </a>
      </div>
      {children}
      <CalmSea className="login-sea pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[120px] w-full" />
    </div>
  );
}
