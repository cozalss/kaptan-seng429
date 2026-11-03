import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { unreachableError } from "@/lib/api/types";
import { SoloLoginForm } from "./solo-login";

const { reachable, signIn, replace } = vi.hoisted(() => ({ reachable: vi.fn(), signIn: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ isReachable: reachable, signIn }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

const SAID = "KAPtan’a ulaşılamıyor. Bilgisayarında çalışıyor mu?";

afterEach(() => {
  vi.clearAllMocks();
});

describe("sign-in when KAPtan does not answer", () => {
  it("says so on arrival instead of a password field, and comes back after a retry", async () => {
    reachable.mockResolvedValueOnce(false);
    render(<SoloLoginForm next={null} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(SAID);
    expect(screen.queryByLabelText("Parola")).toBeNull();

    reachable.mockResolvedValue(true);
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(await screen.findByLabelText("Parola")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not call an unreachable API a wrong password", async () => {
    reachable.mockResolvedValue(true);
    signIn.mockRejectedValue(unreachableError());
    const u = userEvent.setup({ delay: null });
    render(<SoloLoginForm next={null} />);
    await u.type(screen.getByLabelText("Parola"), "parola");
    await u.click(screen.getByRole("button", { name: "Giriş yap" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(SAID);
    expect(screen.queryByText("Parola doğrulanamadı.")).toBeNull();
    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });
});
