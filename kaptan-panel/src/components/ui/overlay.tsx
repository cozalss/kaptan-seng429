"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Dialog as D, Tooltip as T, Tabs as Tb } from "radix-ui";
import { cn } from "@/lib/utils";

/* ── Dialog: a square sheet with a long hard shadow, inked in ─────────── */
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

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

/* ── Drawer: a side sheet from the right (detail views, filters) ──────── */
export function DrawerContent({
  title,
  description,
  children,
  className,
  width = "md",
  ...props
}: Omit<ComponentPropsWithoutRef<typeof D.Content>, "title"> & { title: ReactNode; description?: ReactNode; width?: "md" | "lg" }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-scrim" />
      <D.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l-[1.5px] border-ink bg-panel shadow-[-6px_0_0_var(--ink)] outline-none",
          "data-[state=open]:animate-[drawer-in_320ms_var(--ease-out-expo)]",
          width === "md" ? "max-w-[520px]" : "max-w-[760px]",
          className,
        )}
        {...props}
      >
        <header className="flex items-start gap-3 border-b-[1.5px] border-ink px-5 py-4">
          <div className="min-w-0 flex-1">
            <D.Title className="font-display text-[26px] leading-tight text-ink">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-dense text-muted">{description}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : "Ayrıntı"}</D.Description>}
          </div>
          <D.Close aria-label="Kapat" className="-mr-2 grid size-9 place-items-center text-[22px] leading-none text-ink-soft hover:bg-wash-tint hover:text-ink">
            ×
          </D.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

/* ── Tooltip ──────────────────────────────────────────────────────────── */
export const TooltipProvider = T.Provider;

export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-[280px] border border-ink bg-ink px-2 py-1 text-meta text-on-dark data-[state=delayed-open]:animate-ink-in"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

/* ── Tabs: ink underline on the active tab ────────────────────────────── */
export const Tabs = Tb.Root;
export const TabsContent = Tb.Content;

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof Tb.List>) {
  return <Tb.List className={cn("flex gap-1 overflow-x-auto border-b border-hairline", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof Tb.Trigger>) {
  return (
    <Tb.Trigger
      className={cn(
        "relative -mb-px h-10 shrink-0 border-b-[2.5px] border-transparent px-3 text-ui text-ink-soft",
        "hover:text-ink data-[state=active]:border-ink data-[state=active]:font-medium data-[state=active]:text-ink",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
        className,
      )}
      {...props}
    />
  );
}
