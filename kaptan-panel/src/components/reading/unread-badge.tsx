"use client";

import "./reading.css";

import { useEffect } from "react";
import { useApiQuery, useOptionalApi } from "@/lib/api/react";
import { fmtInt } from "@/lib/format";
import { READING_CHANGED } from "./marks";

const POLL_MS = 60_000;

/** The unread count of your companies' disclosures, next to "Okunanlar" in the bar; nothing when it is zero. */
export function UnreadBadge() {
  const api = useOptionalApi();
  if (!api) return null;
  return <Count />;
}

function Count() {
  const q = useApiQuery((a) => a.readingState(), []);
  const { refetch } = q;
  useEffect(() => {
    const again = () => void refetch();
    window.addEventListener(READING_CHANGED, again);
    const timer = window.setInterval(again, POLL_MS);
    return () => {
      window.removeEventListener(READING_CHANGED, again);
      window.clearInterval(timer);
    };
  }, [refetch]);
  const n = q.data?.unread ?? 0;
  if (n === 0) return null;
  return (
    <span className="rd-badge">
      <span aria-hidden>{n > 99 ? "99+" : fmtInt(n)}</span>
      <span className="sr-only">{fmtInt(n)} okunmamış duyuru</span>
    </span>
  );
}
