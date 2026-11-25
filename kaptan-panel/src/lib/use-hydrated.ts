"use client";

import { useSyncExternalStore } from "react";

const never = () => () => undefined;

/**
 * False in the server's HTML and during hydration, true once React runs this screen in the browser. A button
 * the server drew answers nothing until then: a press that early is lost (or, in a form, sent by the browser on
 * its own). Disable such a button until this says true, so the press waits instead of vanishing.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
}
