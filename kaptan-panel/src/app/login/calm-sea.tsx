import { cn } from "@/lib/utils";
import "./calm-sea.css";

/* Wider than the strip by 48px each side, so the 24px drift never shows an edge on a phone. */
const SWELL = "absolute -left-12 bottom-0 h-full w-[calc(100%+96px)] will-change-transform";
const SWELL_SVG = { viewBox: "0 0 800 200", preserveAspectRatio: "none", className: "block size-full" } as const;

/**
 * The landing's sea after the storm: three flat ink swells (no gradients, no blur) and a small
 * boat riding the top one. Decorative only. Each swell and the boat sit in their own layer (a
 * div), so the drift and the rock are compositor-only transforms (calm-sea.css); all of it
 * stops under reduced motion. Behind a role's door the middle swell takes the role's tone
 * (`--tone`), else the indigo wash. `still` holds it at rest (Bugün's empty day, a place you
 * read rather than arrive at).
 */
export function CalmSea({ className, still = false }: { className?: string; still?: boolean }) {
  return (
    <div aria-hidden data-still={still || undefined} className={cn("calm-sea overflow-hidden", className)}>
      <div className={cn("login-swell login-swell--a", SWELL)}>
        <svg {...SWELL_SVG}>
          <path d="M-40 70 C40 58 110 80 190 68 S330 54 410 66 S560 82 640 66 S760 56 840 64 V200 H-40Z" fill="var(--sunk)" />
          <path d="M-40 70 C40 58 110 80 190 68 S330 54 410 66 S560 82 640 66 S760 56 840 64" fill="none" stroke="var(--ink)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className={cn("login-swell login-swell--b", SWELL)}>
        <svg {...SWELL_SVG}>
          <path d="M-40 112 C70 102 150 120 260 110 S430 98 520 110 S690 124 840 106 V200 H-40Z" fill="var(--tone, var(--wash))" fillOpacity="0.16" />
          <path d="M-40 112 C70 102 150 120 260 110 S430 98 520 110 S690 124 840 106" fill="none" stroke="var(--tone, var(--wash))" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className={cn("login-swell login-swell--c", SWELL)}>
        <svg {...SWELL_SVG}>
          <path d="M-40 152 C90 144 200 160 330 150 S540 140 650 152 S780 160 840 148 V200 H-40Z" fill="var(--ink)" fillOpacity="0.9" />
        </svg>
      </div>
      {/* The boat sits on the first swell (y ≈ 66 of 200 → 67% from the bottom). */}
      <div className="login-boat absolute bottom-[63%] left-[70%] w-[clamp(44px,5vw,64px)] will-change-transform">
        <svg viewBox="0 0 60 46" className="block h-auto w-full">
          <path d="M1 34 H59 L51 44 H9Z" fill="var(--panel)" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M29 2 V34" stroke="var(--ink)" strokeWidth="1.6" />
          <path d="M31 6 L53 31 H31Z" fill="var(--panel)" stroke="var(--ink)" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M27 10 L11 31 H27Z" fill="var(--panel)" stroke="var(--ink)" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M29 2 L39 5 L29 8Z" fill="var(--ink)" />
        </svg>
      </div>
    </div>
  );
}
