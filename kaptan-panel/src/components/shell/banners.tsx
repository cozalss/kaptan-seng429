"use client";

import "./banners.css";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/lib/nav";
import { useDesk } from "./desk-state";
import { systemLine, type SystemLine } from "./system-words";

/** Where the banner's "more" leads: the Sistem block in Ayarlar. */
export const SYSTEM_HREF = `${ROUTES.ayarlar}#sistem`;

/**
 * One quiet line under the top bar when KAPtan itself is not working as it should: an inked
 * logbook line. The live region is always mounted (a region that appears with its text is often
 * not read out). The band opens its own height once, never slides.
 */
export function ShellBanner() {
  const { system, systemDown } = useDesk();
  const line = systemLine(system, systemDown);
  return (
    <div role="status" data-testid="shell-banner">
      {line ? <SystemBand line={line} /> : null}
    </div>
  );
}

/**
 * KAPtan's own state, as a line in the ship's log: no fill, an ink rule above, a hairline below
 * and a strip of engraved fog at its head. What is wrong, what you can do, and the way to the rest.
 */
function SystemBand({ line }: { line: SystemLine }) {
  const onSettings = usePathname() === ROUTES.ayarlar;
  return (
    <div className="sb-log" data-testid="system-line">
      <span aria-hidden className="sb-log-fog u-hatch" />
      <p className="sb-log-text">
        <span className="sb-log-what">{line.message}</span> {line.advice}
      </p>
      {onSettings ? null : (
        <Link href={SYSTEM_HREF} className="sb-log-more">
          Ayrıntı
          <span className="sr-only">: KAPtan’ın durumu, Ayarlar’da</span>
          <span aria-hidden> →</span>
        </Link>
      )}
    </div>
  );
}
