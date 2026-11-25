import { afterEach, describe, expect, it, vi } from "vitest";
import { navigateWithTransition, routeArrived } from "./view-transition";

/** jsdom has no View Transitions: tests put one on and take it off through this loose view of document. */
const doc = document as unknown as { startViewTransition?: (cb: () => Promise<void>) => unknown };

function motion(reduced: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  delete doc.startViewTransition;
  document.body.innerHTML = "";
});

describe("the move from a row to its proposal", () => {
  it("is a plain navigation where View Transitions are missing (jsdom, older browsers)", () => {
    motion(false);
    const go = vi.fn();
    expect(navigateWithTransition(go)).toBe(false);
    expect(go).not.toHaveBeenCalled();
  });

  it("is a plain navigation when motion is reduced", () => {
    motion(true);
    doc.startViewTransition = vi.fn();
    expect(navigateWithTransition(vi.fn())).toBe(false);
  });

  it("hands the shared name to the clicked row's verb only, then navigates and waits for the page", async () => {
    motion(false);
    document.body.innerHTML = '<span class="oneri-verb-shared" id="front"></span><span id="row"></span>';
    let done: Promise<void> | null = null;
    doc.startViewTransition = (cb) => {
      done = cb();
      return {};
    };
    const go = vi.fn();
    const row = document.getElementById("row") as HTMLElement;
    expect(navigateWithTransition(go, row)).toBe(true);
    expect(go).toHaveBeenCalled();
    expect(row.style.viewTransitionName).toBe("oneri-verb");
    expect((document.getElementById("front") as HTMLElement).style.viewTransitionName).toBe("none");
    routeArrived();
    await expect(done).resolves.toBeUndefined();
  });
});
