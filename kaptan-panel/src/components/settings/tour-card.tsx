"use client";

import { Button } from "@/components/ui/button";
import { startGuidedDemo } from "@/components/demo/demo-store";
import { CARD, CARD_PAD, SectionTitle } from "@/components/portfolio/kit";

/** Fetch the tour's bar while the pointer or focus is on the button, so it opens at once. */
const preload = () => void import("@/components/demo/guided-demo-bar");

/** Rehberli tur — the whole panel in fifteen steps, from one button. */
export function TourCard() {
  return (
    <section aria-labelledby="tur-baslik" className={`${CARD} ${CARD_PAD} space-y-4`}>
      <SectionTitle id="tur-baslik" title="Rehberli tur">
        Paneli 15 adımda gezdirir; alttaki çubukta → ile ilerlersin, rol gerektiğinde kendiliğinden değişir.
      </SectionTitle>
      <Button variant="primary" onPointerEnter={preload} onFocus={preload} onClick={() => startGuidedDemo()}>
        Turu başlat
      </Button>
    </section>
  );
}
