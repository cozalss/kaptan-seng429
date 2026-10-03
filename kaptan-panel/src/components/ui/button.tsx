import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Ink button. Square, 1.5px ink border, hard offset shadow that is "printed flat" on press.
 * `danger` (north red) is reserved for the kill switch and rejections.
 */
export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "border-[1.5px] font-sans font-medium select-none",
    "transition-[transform,box-shadow,background-color,color] duration-150 ease-out",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "border-ink bg-ink text-on-dark shadow-ink hover:bg-wash hover:border-wash active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        secondary:
          "border-ink bg-panel text-ink shadow-ink hover:bg-wash-tint active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        ghost: "border-transparent bg-transparent text-ink hover:bg-wash-tint active:bg-wash-tint-strong",
        outline: "border-ink bg-transparent text-ink hover:bg-wash-tint active:bg-wash-tint-strong",
        danger:
          "border-north bg-north text-on-dark shadow-ink hover:bg-[#9b1f18] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        "danger-outline": "border-north bg-panel text-north hover:bg-north-tint active:bg-north-tint",
      },
      size: {
        sm: "h-8 px-3 text-dense",
        md: "h-10 px-4 text-ui",
        lg: "h-12 px-5 text-[15px]",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a Next <Link>) with button styles. */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});
