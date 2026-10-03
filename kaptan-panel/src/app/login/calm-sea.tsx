import { cn } from "@/lib/utils";

/**
 * The landing's sea after the storm: three flat ink swells (no gradients, no blur) and a small
 * boat riding the top one. Decorative only. The swells drift a few pixels and the boat rocks
 * (login.css); both stop under reduced motion.
 */
export function CalmSea({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("overflow-hidden", className)}>
      <svg viewBox="0 0 800 200" preserveAspectRatio="none" className="absolute inset-x-[-4%] bottom-0 h-full w-[108%]">
        <g className="login-swell login-swell--a">
          <path d="M-40 70 C40 58 110 80 190 68 S330 54 410 66 S560 82 640 66 S760 56 840 64 V200 H-40Z" fill="var(--sunk)" />
          <path d="M-40 70 C40 58 110 80 190 68 S330 54 410 66 S560 82 640 66 S760 56 840 64" fill="none" stroke="var(--ink)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        </g>
        <g className="login-swell login-swell--b">
          <path d="M-40 112 C70 102 150 120 260 110 S430 98 520 110 S690 124 840 106 V200 H-40Z" fill="var(--wash)" fillOpacity="0.14" />
          <path d="M-40 112 C70 102 150 120 260 110 S430 98 520 110 S690 124 840 106" fill="none" stroke="var(--wash)" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
        </g>
        <g className="login-swell login-swell--c">
          <path d="M-40 152 C90 144 200 160 330 150 S540 140 650 152 S780 160 840 148 V200 H-40Z" fill="var(--ink)" fillOpacity="0.9" />
        </g>
      </svg>
      {/* The boat sits on the first swell (y ≈ 66 of 200 → 67% from the bottom). */}
      <svg viewBox="0 0 60 46" className="login-boat absolute bottom-[63%] left-[70%] h-auto w-[clamp(44px,5vw,64px)]">
        <path d="M1 34 H59 L51 44 H9Z" fill="var(--panel)" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M29 2 V34" stroke="var(--ink)" strokeWidth="1.6" />
        <path d="M31 6 L53 31 H31Z" fill="var(--panel)" stroke="var(--ink)" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M27 10 L11 31 H27Z" fill="var(--panel)" stroke="var(--ink)" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M29 2 L39 5 L29 8Z" fill="var(--ink)" />
      </svg>
    </div>
  );
}
