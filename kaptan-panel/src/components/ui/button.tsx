import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Ink button. Square, 2px ink border; the hard offset shadow means "this sits on top" and
 * is printed flat on press. A closed button drops its shadow and fill and gets a dashed rule
 * (it reads as "not now", not as faded ink); a pending one stays pressed flat.
 * `danger` (north red) is reserved for Durdur and rejections.
 */
export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "border-2 font-sans font-medium select-none",
    "transition-[translate,box-shadow,background-color,color,border-color] duration-[var(--dur-quick)] ease-[var(--ease-out-expo)] active:duration-[var(--dur-instant)]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    // Written out in full (no template strings) so Tailwind sees every class. Not while pending.
    "[&:disabled:not([data-pending=true])]:shadow-none [&:disabled:not([data-pending=true])]:bg-transparent [&:disabled:not([data-pending=true])]:border-dashed [&:disabled:not([data-pending=true])]:border-rule-ui [&:disabled:not([data-pending=true])]:text-muted disabled:cursor-not-allowed",
    "data-[pending=true]:translate-x-[3px] data-[pending=true]:translate-y-[3px] data-[pending=true]:shadow-none data-[pending=true]:cursor-progress",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "border-ink bg-ink text-on-dark shadow-ink hover:bg-ink-lift hover:border-ink-lift active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        secondary:
          "border-ink bg-panel text-ink shadow-ink hover:bg-wash-tint active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        ghost: "border-transparent bg-transparent text-ink hover:bg-wash-tint active:bg-wash-tint-strong",
        outline: "border-ink bg-transparent text-ink hover:bg-wash-tint active:bg-wash-tint-strong",
        danger:
          "border-north bg-north text-on-dark shadow-ink hover:bg-north-deep hover:border-north-deep active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        "danger-outline":
          "border-north bg-panel text-north shadow-[3px_3px_0_var(--north)] hover:bg-north-tint active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
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
