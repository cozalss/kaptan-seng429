import { cn } from "@/lib/utils";

/**
 * The KAPtan mark (same drawing as the landing's #kaptan-logo): compass dial, E/W ticks,
 * needle, "KAPtan" in Bodoni Moda 700. Navy is the wordmark's only job (DESIGN §2).
 */
export function Wordmark({ className, title = "KAPtan" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 212 64" role="img" aria-label={title} className={cn("text-brand", className)}>
      <ellipse cx="30" cy="32" rx="26.5" ry="27.5" fill="none" stroke="currentColor" strokeWidth="5.5" />
      <path d="M6.6 32H10.2M49.8 32H53.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M30 10.6 32.7 32H27.3Z" fill="currentColor" />
      <path d="M27.3 32 30 53.4 32.7 32" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="30" cy="32" r="1.7" fill="currentColor" />
      <text x="67" y="46" fill="currentColor" fontSize="38" fontWeight="700" letterSpacing="-0.5" style={{ fontFamily: "var(--font-wordmark-face), Didot, Georgia, serif" }}>
        KAPtan
      </text>
    </svg>
  );
}

