import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { unreachableError } from "@/lib/api/types";
import { nav } from "../nav.test-utils";
import { HttpBoot, SoloShell } from "./solo-shell";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const me = vi.fn();
vi.mock("@/lib/api/client", () => ({
  createClient: () => ({
    me,
    counters: () => new Promise(() => undefined),
    riskStatus: () => new Promise(() => undefined),
    listApprovals: () => new Promise(() => undefined),
  }),
}));

afterEach(() => {
  me.mockReset();
  nav.replace.mockClear();
  nav.pathname = "/benim";
});

describe("SoloShell", () => {
  it("shows the four screens and marks the current one", () => {
    nav.pathname = "/oneri/prop-1";
    render(
      <SoloShell user={{ uid: "sen", name: "Deniz Su" }}>
        <p>ekran</p>
      </SoloShell>,
    );
    const links = within(screen.getByRole("navigation", { name: "Ana gezinme" })).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["Ana sayfa", "Param", "Okunanlar", "Geçmiş"]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[1]).not.toHaveAttribute("aria-current");
  });

  it("keeps Ayarlar and Çıkış in the account menu", async () => {
    render(
      <SoloShell user={{ uid: "sen", name: "Deniz Su" }}>
        <p>ekran</p>
      </SoloShell>,
    );
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Hesabım" }));
    expect(await screen.findByRole("menuitem", { name: "Ayarlar" })).toHaveAttribute("href", "/ayarlar");
    expect(screen.getByRole("menuitem", { name: "Çıkış" })).toBeInTheDocument();
  });
});

describe("HttpBoot (http mode)", () => {
  it("waits for /me, then shows the frame", async () => {
    me.mockResolvedValue({ id: "sen", display_name: "Kişi" });
    render(
      <HttpBoot>
        <p>ev</p>
      </HttpBoot>,
    );
    expect(screen.getByRole("status", { name: "Yükleniyor" })).toBeInTheDocument();
    expect(await screen.findByText("ev")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Param" })).toBeInTheDocument();
  });

  it("sends a signed-out visitor to sign in and back here", async () => {
    me.mockRejectedValue(new Error("401"));
    render(
      <HttpBoot>
        <p>ev</p>
      </HttpBoot>,
    );
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login?next=%2Fbenim"));
    expect(screen.queryByText("ev")).not.toBeInTheDocument();
  });

  it("says so when KAPtan does not answer, stays put, and retries", async () => {
    me.mockRejectedValue(unreachableError());
    render(
      <HttpBoot>
        <p>ev</p>
      </HttpBoot>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "KAPtan’a ulaşılamıyor. Bilgisayarında çalışıyor mu?" })).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
    me.mockResolvedValue({ id: "sen", display_name: "Sahip" });
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(await screen.findByText("ev")).toBeInTheDocument();
  });
});
