import { prefersReducedMotion } from "@/lib/utils";

/**
 * The shared-element move from a suggestion on the home to its "Neden?" page: the big verb carries
 * over (`view-transition-name: oneri-verb`, oneri.css). Falls back to a plain navigation where View
 * Transitions are missing or motion is reduced.
 */
const ROUTE_WAIT_MS = 300;

let arrived: (() => void) | null = null;

const SHARED = "oneri-verb";

/**
 * Lets `source` (a row's small AL/SAT) be the one that grows into the proposal's big verb: a name may be on
 * one element only, so any other `.oneri-verb-shared` on the page gives it up for this move.
 */
function carryFrom(source: HTMLElement): void {
  document.querySelectorAll<HTMLElement>(".oneri-verb-shared").forEach((el) => {
    if (el !== source) el.style.viewTransitionName = "none";
  });
  source.style.viewTransitionName = SHARED;
}

/**
 * Runs `go` inside a view transition. False: not supported here (no `startViewTransition`, as in jsdom and
 * older browsers) or motion is reduced, and the caller navigates normally. `source`: the element whose
 * verb carries over, when it is not the page's own `.oneri-verb-shared`.
 */
export function navigateWithTransition(go: () => void, source?: HTMLElement | null): boolean {
  if (typeof document === "undefined" || typeof document.startViewTransition !== "function" || prefersReducedMotion()) return false;
  if (source) carryFrom(source);
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
