import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * The app's buttons, the landing's ink button grown up: one primary (indigo fill), one secondary
 * (a sheet with an ink border), one destructive (north red, reserved for Durdur and rejections).
 * Square with a hard offset shadow; a press prints the button flat onto the page. A closed button
 * drops its fill and gets a dashed rule (it reads as "not now", not as faded ink); a pending one
 * says it is busy.
 */
export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "rounded-lg border-2 font-sans font-medium select-none",
    "transition-[translate,background-color,color,border-color,box-shadow] duration-[var(--dur-quick)] ease-[var(--ease-out-expo)] active:duration-[var(--dur-instant)]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    // Written out in full (no template strings) so Tailwind sees every class. Not while pending.
    "[&:disabled:not([data-pending=true])]:shadow-none [&:disabled:not([data-pending=true])]:bg-transparent [&:disabled:not([data-pending=true])]:border-dashed [&:disabled:not([data-pending=true])]:border-rule-ui [&:disabled:not([data-pending=true])]:text-muted disabled:cursor-not-allowed",
    "data-[pending=true]:opacity-80 data-[pending=true]:cursor-progress",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "border-brand bg-brand text-on-dark hover:bg-navy-raised hover:border-navy-raised shadow-[var(--shadow-ink)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        secondary: "border-ink bg-panel text-ink hover:bg-wash-tint shadow-[var(--shadow-ink)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        ghost: "border-transparent bg-transparent text-ink hover:bg-wash-tint active:bg-wash-tint-strong",
        outline: "border-ink bg-transparent text-ink hover:bg-wash-tint active:bg-wash-tint-strong",
        danger: "border-north bg-north text-on-dark hover:bg-north-deep hover:border-north-deep shadow-[var(--shadow-ink)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        "danger-outline": "border-north bg-panel text-north hover:bg-north-tint active:translate-y-px",
        /** A text button: underlined words, no box, still a 44px target. */
        link: "inline-flex min-h-11 items-center rounded-none border-transparent bg-transparent px-0 font-normal text-ink underline underline-offset-4 decoration-[1.5px] decoration-rule-ui hover:decoration-ink",
      },
      size: {
        sm: "h-8 px-3 text-dense max-sm:h-11",
        md: "h-11 px-4 text-ui",
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
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, pending = false, type, children, ...props },
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
          {children}
        </>
      )}
    </Comp>
  );
});
