"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { cn } from "@/lib/utils";

/* ── Dialog: a square sheet laid on top (long hard shadow), rising 8px into place ── */
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;

export function DialogContent({
  title,
  description,
  children,
  className,
  size = "md",
  tone = "default",
  ...props
}: Omit<ComponentPropsWithoutRef<typeof D.Content>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "critical";
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=open]:animate-[fade-in_160ms_var(--ease-out-expo)] data-[state=closed]:animate-[fade-out_120ms_var(--ease-out-expo)]" />
      <D.Content
        className={cn(
          "fixed top-[max(8px,6vh)] left-1/2 z-50 max-h-[calc(100dvh-16px)] w-[calc(100vw-32px)] -translate-x-1/2 overflow-y-auto overscroll-contain border-2 bg-panel shadow-ink-lg outline-none",
          "data-[state=open]:animate-[dialog-in_220ms_var(--ease-out-expo)] data-[state=closed]:animate-[fade-out_120ms_var(--ease-out-expo)]",
          tone === "critical" ? "border-north" : "border-ink",
          size === "sm" && "max-w-[420px]",
          size === "md" && "max-w-[560px]",
          size === "lg" && "max-w-[760px]",
          className,
        )}
        {...props}
      >
        <header className={cn("flex items-start gap-3 border-b-2 px-5 pt-4 pb-3", tone === "critical" ? "border-north" : "border-ink")}>
          <div className="min-w-0 flex-1">
            <D.Title className={cn("font-display-text text-title", tone === "critical" ? "text-north" : "text-ink")}>{title}</D.Title>
            {description ? <D.Description className="mt-1 text-ui text-ink-soft">{description}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : "Ayrıntı"}</D.Description>}
          </div>
          <D.Close aria-label="Kapat" className="-mt-2 -mr-3 grid size-11 shrink-0 place-items-center text-ink-soft transition-colors duration-[var(--dur-quick)] hover:bg-wash-tint hover:text-ink">
            <svg aria-hidden viewBox="0 0 14 14" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M2 2l10 10M12 2 2 12" />
            </svg>
          </D.Close>
        </header>
        <div className="px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
