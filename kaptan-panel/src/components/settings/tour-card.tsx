"use client";

import { Button } from "@/components/ui/button";
import { startGuidedDemo } from "@/components/demo/demo-store";

/** Fetch the tour's bar while the pointer or focus is on the button, so it opens at once. */
const preload = () => void import("@/components/demo/guided-demo-bar");

/**
 * Rehberli tur — the whole panel in fifteen steps, from one button. The card is plain paper;
 * only the button is "set on top".
 */
export function TourCard() {
  return (
    <section aria-labelledby="tur-baslik" className="space-y-3 border-2 border-ink bg-panel px-5 py-5 sm:px-7 sm:py-6">
      <h2 id="tur-baslik" className="font-display-text text-title text-ink">
        Rehberli tur
      </h2>
      <p className="max-w-[560px] text-ui text-ink-soft">
        Paneli 15 adımda gezdirir: bir öneri gelir, iki imza atılır, defter doğrulanır, sistem durdurulup iki kişiyle yeniden açılır. Alttaki çubukta → ile ilerlersin; gerekince rol kendiliğinden değişir.
      </p>
      <Button variant="primary" size="lg" className="mt-1" onPointerEnter={preload} onFocus={preload} onClick={() => startGuidedDemo()}>
        Turu başlat
      </Button>
    </section>
  );
}
