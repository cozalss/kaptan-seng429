import { prefersReducedMotion } from "@/lib/utils";

/**
 * The shared-element move from a suggestion on the home to its "Neden?" page: the big verb carries
 * over (`view-transition-name: oneri-verb`, oneri.css). Falls back to a plain navigation where View
 * Transitions are missing or motion is reduced.
 */
const ROUTE_WAIT_MS = 300;

let arrived: (() => void) | null = null;

/** Runs `go` inside a view transition. False: not supported here, the caller navigates normally. */
export function navigateWithTransition(go: () => void): boolean {
  if (typeof document === "undefined" || typeof document.startViewTransition !== "function" || prefersReducedMotion()) return false;
  document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        // A slow route must not freeze the page: after this long the old page crossfades to itself.
        const timer = setTimeout(() => {
          arrived = null;
          resolve();
        }, ROUTE_WAIT_MS);
        arrived = () => {
          clearTimeout(timer);
          arrived = null;
          resolve();
        };
        go();
      }),
  );
  return true;
}

/** Called by the destination once it has rendered: the browser may take its snapshot now. */
export function routeArrived(): void {
  arrived?.();
}
