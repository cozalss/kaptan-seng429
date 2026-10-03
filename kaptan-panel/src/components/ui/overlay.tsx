"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { cn } from "@/lib/utils";

/* ── Dialog: a square sheet with a long hard shadow, inked in ─────────── */
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
      <D.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-[1px] data-[state=open]:animate-[ink-in_200ms_ease-out]" />
      <D.Content
        className={cn(
          "fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-32px)] -translate-x-1/2 border-[1.5px] bg-panel shadow-ink-lg outline-none",
          "data-[state=open]:animate-ink-in",
          tone === "critical" ? "border-north" : "border-ink",
          size === "sm" && "max-w-[420px]",
          size === "md" && "max-w-[560px]",
          size === "lg" && "max-w-[760px]",
          className,
        )}
        {...props}
      >
        <header className={cn("flex items-start gap-3 border-b px-5 pt-4 pb-3", tone === "critical" ? "border-north" : "border-hairline")}>
          <div className="min-w-0 flex-1">
            <D.Title className={cn("font-display text-[24px] leading-tight", tone === "critical" ? "text-north" : "text-ink")}>{title}</D.Title>
            {description ? <D.Description className="mt-1 text-ui text-ink-soft">{description}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : "Ayrıntı"}</D.Description>}
          </div>
          <D.Close aria-label="Kapat" className="-mt-1 -mr-2 grid size-9 place-items-center text-[20px] leading-none text-ink-soft hover:bg-wash-tint hover:text-ink">
            ×
          </D.Close>
        </header>
        <div className="px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
