import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockApi, renderWithApi } from "@/components/solo/money.test-utils";
import { ParamFromHome } from "./param-from-home";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

describe("Param: what left the home", () => {
  it("shows where the money sits and the recent log, with the way to Geçmiş", async () => {
    const api = mockApi({ fresh: false });
    const [overview, positions] = await Promise.all([api.overview(), api.positions()]);
    renderWithApi(<ParamFromHome overview={overview} positions={positions} />, api);
    expect(screen.getByRole("region", { name: "Param nerede?" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("son-islemler").textContent).toMatch(/aldın|onayladın|geçtin/));
    expect(screen.getByRole("link", { name: /Geçmişin tamamı/ })).toHaveAttribute("href", "/gecmis");
  });
});
