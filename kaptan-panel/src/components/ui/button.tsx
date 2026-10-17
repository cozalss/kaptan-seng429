import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * The panel's buttons: one primary (indigo fill), one secondary (white with an ink border),
 * one destructive (north red, reserved for Durdur and rejections). Square, 2px border, flat;
 * a press nudges the button 1px down. A closed button drops its fill and gets a dashed rule
 * (it reads as "not now", not as faded ink); a pending one says it is busy.
 */
export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "border-2 font-sans font-medium select-none",
    "transition-[translate,background-color,color,border-color] duration-[var(--dur-quick)] ease-[var(--ease-out-expo)] active:duration-[var(--dur-instant)]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    // Written out in full (no template strings) so Tailwind sees every class. Not while pending.
    "[&:disabled:not([data-pending=true])]:shadow-none [&:disabled:not([data-pending=true])]:bg-transparent [&:disabled:not([data-pending=true])]:border-dashed [&:disabled:not([data-pending=true])]:border-rule-ui [&:disabled:not([data-pending=true])]:text-muted disabled:cursor-not-allowed",
    "data-[pending=true]:opacity-80 data-[pending=true]:cursor-progress",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "border-brand bg-brand text-on-dark hover:bg-ink hover:border-ink active:translate-y-px",
        secondary: "border-ink bg-panel text-ink hover:bg-wash-tint active:translate-y-px",
        ghost: "border-transparent bg-transparent text-ink hover:bg-wash-tint active:bg-wash-tint-strong",
        outline: "border-ink bg-transparent text-ink hover:bg-wash-tint active:bg-wash-tint-strong",
        danger: "border-north bg-north text-on-dark hover:bg-north-deep hover:border-north-deep active:translate-y-px",
        "danger-outline": "border-north bg-panel text-north hover:bg-north-tint active:translate-y-px",
        /** A text button: underlined words, no box, still a 44px target. */
        link: "inline-flex min-h-11 items-center border-transparent bg-transparent px-0 font-normal text-ink underline underline-offset-4 decoration-[1.5px] decoration-rule-ui hover:decoration-ink",
      },
      size: {
        sm: "h-8 px-3 text-dense max-sm:h-11",
        md: "h-10 px-4 text-ui",
        lg: "h-12 px-5 text-ui",
        icon: "size-9 p-0 max-sm:size-11",
      },
    },
    // A closed text button stays a text button: no dashed box around the words.
    compoundVariants: [{ variant: "link", class: "h-auto px-0 [&:disabled:not([data-pending=true])]:border-transparent" }],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a Next <Link>) with button styles. */
  asChild?: boolean;
  /** The action is running: the button stays pressed flat and says it is busy. */
  pending?: boolean;
  /** Closed for your role: a small lock before the words (pair it with <Denied/>). */
  locked?: boolean;
}

function Lock() {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3! shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="2" y="5.25" width="8" height="5.5" />
      <path d="M3.75 5.25V3.5a2.25 2.25 0 0 1 4.5 0v1.75" />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, pending = false, locked = false, type, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      data-pending={pending ? "true" : undefined}
      aria-busy={pending || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {locked ? <Lock /> : null}
          {children}
        </>
      )}
    </Comp>
  );
});
