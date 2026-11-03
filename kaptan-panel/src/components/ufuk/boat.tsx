import { cn } from "@/lib/utils";

/**
 * The landing's small sailing boat with its red flag: the same drawing, in ink. It marks "today"
 * on the money line and turns up wherever a screen wants the same world. Ink comes from
 * `currentColor`, the sails and hull take --boat-fill (paper by default), the flag stays red.
 * The keel sits at 90% of its height, so a boat placed there stands on the water.
 */
export function Boat({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      className={cn("text-ink", className)}
    >
      <g fill="var(--boat-fill, var(--paper))" stroke="none">
        <path d="M76 26C64 48 52 70 40 88H76Z" />
        <path d="M81 22C100 40 116 66 124 86L82 88Z" />
        <path d="M14 92C30 97 110 99 148 88 140 101 124 108 96 110H52C34 108 22 102 14 92Z" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 92C30 97 110 99 148 88 140 101 124 108 96 110H52C34 108 22 102 14 92Z" />
        <path d="M20 97C60 102 110 102 142 94" />
        <path d="M78 95 80 17" />
        <path d="M81 22C100 40 116 66 124 86L82 88" />
        <path d="M76 26C64 48 52 70 40 88H76" />
        <path d="M83 42 107 45M83 60 116 63M83 76 121 78" />
        <path d="M58 94 57 83M53 88 62 86" />
        <circle cx="57" cy="79" r="3.2" />
      </g>
      <path d="M80 17 94 21 80 25Z" fill="var(--flag)" />
    </svg>
  );
}
