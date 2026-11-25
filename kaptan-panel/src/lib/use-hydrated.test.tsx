import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VerifyBand } from "@/components/audit/verify-panel";
import { SoloLoginForm } from "@/components/solo/solo-login";
import { useHydrated } from "./use-hydrated";

vi.mock("next/navigation", async () => (await import("@/components/nav.test-utils")).mockNavigation());

function Probe() {
  return <p>{useHydrated() ? "browser" : "server"}</p>;
}

/** The server's HTML parsed into a detached document, to ask it what the person sees before the JS runs. */
const serverHtml = (ui: React.ReactElement) => new DOMParser().parseFromString(renderToString(ui), "text/html");

describe("a press before the page is ready waits instead of vanishing", () => {
  it("useHydrated is false in the server's HTML and true in the browser", () => {
    expect(renderToString(<Probe />)).toContain("server");
    render(<Probe />);
    expect(screen.getByText("browser")).toBeInTheDocument();
  });

  it("'Kayıtlar sağlam mı?' is drawn disabled by the server and enabled once hydrated", () => {
    const html = serverHtml(<VerifyBand walk={{ phase: "idle" }} onVerify={() => undefined} onShow={() => undefined} />);
    expect(html.querySelector("button")?.hasAttribute("disabled")).toBe(true);
    render(<VerifyBand walk={{ phase: "idle" }} onVerify={() => undefined} onShow={() => undefined} />);
    expect(screen.getByRole("button", { name: "Kayıtlar sağlam mı?" })).toBeEnabled();
  });

  it("the sign-in form takes no password and no press before it is hydrated", () => {
    const html = serverHtml(<SoloLoginForm next={null} />);
    expect(html.querySelector("button[type=submit]")?.hasAttribute("disabled")).toBe(true);
    expect(html.querySelector("#parola")?.hasAttribute("readonly")).toBe(true);
    render(<SoloLoginForm next={null} />);
    expect(screen.getByRole("button", { name: "Giriş yap" })).toBeEnabled();
    expect(screen.getByLabelText("Parola")).not.toHaveAttribute("readonly");
  });
});
