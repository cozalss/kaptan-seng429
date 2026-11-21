"use client";

import { useEffect } from "react";
import { useOptionalApi } from "@/lib/api/react";
import { rememberAlertPrefs } from "./desktop-gate";

/** Mounted once in the app: keeps this browser's copy of the alert preferences (desktop-gate.ts) current. Renders nothing. */
export function PrefsSync() {
  const api = useOptionalApi();
  useEffect(() => {
    let alive = true;
    if (!api) return;
    Promise.resolve()
      .then(() => api.preferences())
      .then(
        (p) => alive && rememberAlertPrefs(p.alerts),
        () => undefined, // an unanswered call keeps the last copy
      );
    return () => {
      alive = false;
    };
  }, [api]);
  return null;
}
