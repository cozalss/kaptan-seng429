import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one big sentence of a screen. `focusTarget` makes it the place focus lands after a route
 * change, so a screen reader starts reading at the sentence.
 */
export function BigSentence({
  children,
  className,
  id,
  as: Tag = "h1",
  focusTarget = false,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  as?: "h1" | "p";
  focusTarget?: boolean;
}) {
  return (
    <Tag id={id} tabIndex={focusTarget ? -1 : undefined} data-route-focus={focusTarget ? "" : undefined} className={cn("u-sentence text-ink", focusTarget && "outline-none", className)}>
      {children}
    </Tag>
  );
}

