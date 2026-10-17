"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { demoStore } from "./demo-store";

/** The bar and everything it needs (API calls, role switching) stay out of every page until a tour starts. */
const GuidedDemoBar = dynamic(() => import("./guided-demo-bar"), { ssr: false });

/**
 * Rehberli tur — renders nothing until a tour is running, then the bar at the bottom
 * (guided-demo-bar.tsx). Started from Ayarlar → "Turu başlat".
 */
export function GuidedDemo() {
  const s = useSyncExternalStore(demoStore.subscribe, demoStore.get, demoStore.server);
  if (!s.active) return null;
  return <GuidedDemoBar index={s.index} nonce={s.nonce} />;
}
