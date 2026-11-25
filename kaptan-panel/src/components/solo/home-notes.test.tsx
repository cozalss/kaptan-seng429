import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { KaptanApi } from "@/lib/api/types";
import { BenchmarkLine } from "./benchmark-line";
import { MorningBrief, sinceMorningSentence } from "./morning-brief";
import { mockApi, renderWithApi } from "./money.test-utils";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const quiet = (over: Partial<KaptanApi>): KaptanApi => ({ ...mockApi({ fresh: false }), ...over });

describe("home notes", () => {
  it("shows the morning brief as 'Bu sabah' and nothing when there is none", async () => {
    renderWithApi(<MorningBrief />, mockApi({ fresh: false }));
    expect(await screen.findByTestId("bu-sabah")).toBeInTheDocument();
    expect(screen.getByText("Bu sabah")).toBeInTheDocument();
  });

  it("shows nothing for a 404 brief (null) and nothing when the request fails", async () => {
    const { unmount } = renderWithApi(<MorningBrief />, quiet({ briefToday: () => Promise.resolve(null) }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("bu-sabah")).toBeNull();
    unmount();
    renderWithApi(<MorningBrief />, quiet({ briefToday: () => Promise.reject(new Error("x")) }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("bu-sabah")).toBeNull();
  });

  it("shows the benchmark sentence, and nothing without an honest comparison", async () => {
    const { unmount } = renderWithApi(<BenchmarkLine />, mockApi({ fresh: false }));
    await waitFor(() => expect(screen.getByTestId("benchmark-line").textContent).toMatch(/aynı sürede BIST 100 %3,2 arttı/));
    unmount();
    renderWithApi(<BenchmarkLine />, mockApi({ fresh: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("benchmark-line")).toBeNull();
  });
});

describe("sinceMorningSentence", () => {
  it("says what is left after the 08:45 picture, and nothing while nothing changed", () => {
    expect(sinceMorningSentence(4, 4)).toBeNull();
    expect(sinceMorningSentence(0, 0)).toBeNull();
    expect(sinceMorningSentence(4, 3)).toBe("Sabahtan bu yana 1 öneriye cevap verdin; 3 öneri hâlâ bekliyor.");
    expect(sinceMorningSentence(4, 0)).toBe("Sabahtan bu yana 4 öneriye cevap verdin; bekleyen öneri kalmadı.");
  });
});
