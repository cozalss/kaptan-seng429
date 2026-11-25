import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpScreen } from "@/components/help/help-screen";
import { renderWithDesk } from "../harness.test-utils";
import { SHORTCUTS } from "./shortcut-list";
import { openShortcuts, Shortcuts } from "./shortcuts";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const keyWarnings = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).filter((m: string) => /same key|unique "key"/.test(m));

afterEach(() => vi.restoreAllMocks());

/** "g g" (Geçmiş) repeats a letter: the lists that print the keys must not key them by the letter alone. */
describe("the shortcut lists key every key press apart", () => {
  it("a shortcut can repeat a letter", () => {
    expect(SHORTCUTS.some((s) => new Set(s.keys).size < s.keys.length)).toBe(true);
  });

  it("the ? sheet lists g g without a duplicate-key warning", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<Shortcuts />);
    act(() => openShortcuts());
    expect(await screen.findByRole("dialog", { name: "Klavye kısayolları" })).toBeInTheDocument();
    expect(screen.getByText("Geçmiş’e git")).toBeInTheDocument();
    expect(keyWarnings(spy)).toEqual([]);
  });

  it("Yardım's shortcut list prints g g without a duplicate-key warning", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderWithDesk(<HelpScreen />);
    expect(await screen.findByText("Geçmiş’e git")).toBeInTheDocument();
    expect(keyWarnings(spy)).toEqual([]);
  });
});
