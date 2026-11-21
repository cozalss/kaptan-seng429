"use client";

import { useRouter } from "next/navigation";
import type { PriceAlertEvent } from "@/lib/domain/price-alerts";
import { raiseDesktopAlert } from "@/lib/alerts/desktop";
import { fmtPrice } from "@/lib/format";
import { href } from "@/lib/nav";
import { useEventStream } from "@/lib/sse/use-event-stream";

/** The desktop text of a fired price alert. It names the company because it never leaves this computer. */
export function priceAlertBody(
  e: Pick<PriceAlertEvent, "name" | "ticker" | "direction" | "price">,
): string {
  return `${e.name} (${e.ticker}) ${e.direction === "above" ? "yükseldi" : "düştü"}: ${fmtPrice(e.price)}. Kurduğun fiyat uyarısı tetiklendi.`;
}

/** A price alert fired: a desktop notification when you are not looking at the app (only if you turned them on). Renders nothing. */
export function PriceAlertWatch() {
  const router = useRouter();
  useEventStream("desk", {
    price_alert: (e) => {
      raiseDesktopAlert(
        {
          kind: "price",
          body: priceAlertBody(e),
          path: href.company(e.ticker),
        },
        (path) => router.push(path),
      );
    },
  });
  return null;
}
