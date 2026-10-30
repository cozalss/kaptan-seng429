import { render, screen, waitFor } from "@testing-library/react";
import { nav } from "../nav.test-utils";
import { SoloHttpBoot } from "./solo-shell";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const me = vi.fn();
vi.mock("@/lib/api/client", () => ({ createClient: () => ({ me }) }));

afterEach(() => {
  me.mockReset();
  me.mockResolvedValue({ id: "uye-2", display_name: "Kişi", role: "risk_officer" });
  nav.replace.mockClear();
});

describe("SoloHttpBoot (http mode)", () => {
  it("waits for /me, then shows the frame", async () => {
    me.mockResolvedValue({ id: "uye-2", display_name: "Kişi", role: "risk_officer" });
    render(
      <SoloHttpBoot>
        <p>ev</p>
      </SoloHttpBoot>,
    );
    expect(screen.getByRole("status", { name: "Yükleniyor" })).toBeInTheDocument();
    expect(await screen.findByText("ev")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gelişmiş görünüm" })).toBeInTheDocument();
  });

  it("sends a signed-out visitor to sign in and back here", async () => {
    me.mockRejectedValue(new Error("401"));
    render(
      <SoloHttpBoot>
        <p>ev</p>
      </SoloHttpBoot>,
    );
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login?next=%2Fbenim"));
    expect(screen.queryByText("ev")).not.toBeInTheDocument();
  });
});
