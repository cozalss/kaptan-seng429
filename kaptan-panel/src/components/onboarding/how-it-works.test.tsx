import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HowItWorks, openHowItWorks } from "./how-it-works";
import { HOWTO_KEY } from "./seen";

const user = () => userEvent.setup({ delay: null });

afterEach(() => {
  window.localStorage.clear();
});

describe("KAPtan nasıl çalışır", () => {
  it("shows itself on the first visit, steps through three steps, and is remembered", async () => {
    const u = user();
    const { unmount } = render(<HowItWorks />);
    const dialog = await screen.findByRole("dialog", { name: "KAPtan okur." });
    await u.click(within(dialog).getByRole("button", { name: "Devam" }));
    expect(await screen.findByRole("dialog", { name: "Kurallar süzer." })).toBeInTheDocument();
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Devam" }));
    const last = await screen.findByRole("dialog", { name: "Sen karar verirsin." });
    expect(last).toHaveTextContent("KAPtan kendi başına asla alıp satmaz.");
    await u.click(within(last).getByRole("button", { name: "Anladım" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.localStorage.getItem(HOWTO_KEY)).toBe("1");

    unmount();
    render(<HowItWorks />);
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("can be skipped from any step, with the button or Esc, and that is remembered too", async () => {
    const u = user();
    render(<HowItWorks />);
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Geç" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.localStorage.getItem(HOWTO_KEY)).toBe("1");

    act(() => openHowItWorks());
    expect(await screen.findByRole("dialog", { name: "KAPtan okur." })).toBeInTheDocument();
    await u.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("reopens at the first step and turns pages with the arrow keys", async () => {
    window.localStorage.setItem(HOWTO_KEY, "1");
    const u = user();
    render(<HowItWorks />);
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => openHowItWorks());
    await screen.findByRole("dialog", { name: "KAPtan okur." });
    await u.keyboard("{ArrowRight}");
    expect(await screen.findByRole("dialog", { name: "Kurallar süzer." })).toBeInTheDocument();
    await u.keyboard("{ArrowLeft}");
    expect(await screen.findByRole("dialog", { name: "KAPtan okur." })).toBeInTheDocument();
  });

  it("puts focus on the step's sentence, inside the dialog", async () => {
    render(<HowItWorks />);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("heading", { level: 2 })).toHaveFocus());
  });
});
