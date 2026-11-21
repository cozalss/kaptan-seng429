"use client";

import "./reading.css";

import { useOptionalApi } from "@/lib/api/react";
import { fmtInt } from "@/lib/format";
import { useReadingState } from "./marks";

/**
 * The unread count of your companies' disclosures (starred or held), next to "Okunanlar" in the bar; nothing when it
 * is zero. It shares one answer with the Okunanlar page, so both always show the same number.
 */
export function UnreadBadge() {
  const api = useOptionalApi();
  if (!api) return null;
  return <Count />;
}

function Count() {
  const n = useReadingState().state?.unread ?? 0;
  if (n === 0) return null;
  return (
    <span className="rd-badge" title={`İzlediğin ve elindeki şirketlerde ${fmtInt(n)} okunmamış duyuru`}>
      <span aria-hidden>{n > 99 ? "99+" : fmtInt(n)}</span>
      <span className="sr-only">{fmtInt(n)} okunmamış duyuru</span>
    </span>
  );
}
