"use client";

import { useNow } from "@/lib/clock";
import { exactPriceTime, holdingPriceSentence, pricesAgeSentence } from "@/lib/solo/money-words";
import { cn } from "@/lib/utils";
import "./money.css";

/**
 * How old the prices behind a figure are, in plain words ("Fiyatlar bugün 14:05’ten."). The exact
 * time shows on hover and on keyboard focus, and is read out with the sentence. Renders nothing
 * when there is no price to speak of (cash only) or while the clock is unknown: no guess.
 */
export function PriceAge({ asOf, holding = false, className }: { asOf: string | null; holding?: boolean; className?: string }) {
  const now = useNow(60_000);
  const sentence = holding ? holdingPriceSentence(asOf, now) : pricesAgeSentence(asOf, now);
  if (!sentence) return null;
  if (asOf === null) return <span className={cn("pa", className)}>{sentence}</span>;
  const exact = exactPriceTime(asOf);
  return (
    <span className={cn("pa pa--timed", className)} tabIndex={0} data-exact={exact}>
      {sentence}
      <span className="sr-only"> {exact}.</span>
    </span>
  );
}
