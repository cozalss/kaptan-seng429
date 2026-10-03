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

/**
 * Compass rose — the hand-drawn touch for empty states, the login plate and the kill switch.
 * `north` paints the needle's north half red: only when the state is critical.
 */
export function Compass({ size = 64, north = false, className, spin = 0 }: { size?: number; north?: boolean; className?: string; spin?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <circle cx="32" cy="32" r="29" fill="none" stroke="var(--ink)" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="24.5" fill="none" stroke="var(--rule-soft)" strokeWidth="1" strokeDasharray="1.5 3.2" />
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i * Math.PI) / 8;
        const r1 = i % 4 === 0 ? 25 : 27;
        return (
          <line
            key={i}
            x1={32 + Math.sin(a) * r1}
            y1={32 - Math.cos(a) * r1}
            x2={32 + Math.sin(a) * 29}
            y2={32 - Math.cos(a) * 29}
            stroke="var(--ink)"
            strokeWidth={i % 4 === 0 ? 1.5 : 0.8}
          />
        );
      })}
      <g transform={`rotate(${spin} 32 32)`}>
        <path d="M32 9 35.4 32H28.6Z" fill={north ? "var(--north)" : "var(--ink)"} />
        <path d="M28.6 32 32 55 35.4 32" fill="var(--panel)" stroke="var(--ink)" strokeWidth="1.2" strokeLinejoin="round" />
      </g>
      <circle cx="32" cy="32" r="2.2" fill="var(--panel)" stroke="var(--ink)" strokeWidth="1.2" />
      <text x="32" y="7.2" textAnchor="middle" fontSize="6.5" fill="var(--ink)" style={{ fontFamily: "var(--font-bodoni), Georgia, serif" }}>
        K
      </text>
    </svg>
  );
}

/** A short brushed ink rule — section divider with a little hand in it. */
export function InkRule({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 8" preserveAspectRatio="none" aria-hidden className={cn("h-2 w-full text-ink", className)}>
      <path d="M1 4.6C40 3.2 80 5.4 120 4.1S200 3.4 239 4.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M2 5.4C60 4.9 130 5.6 238 5.1" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
    </svg>
  );
}
