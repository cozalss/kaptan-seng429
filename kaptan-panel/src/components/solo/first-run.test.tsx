import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HOWTO_KEY } from "@/components/onboarding/seen";
import { ApiError, type KaptanApi } from "@/lib/api/types";
import { FirstRun } from "./first-run";
import { mockApi, renderWithApi } from "./money.test-utils";

const user = () => userEvent.setup({ delay: null });

afterEach(() => window.localStorage.clear());

describe("FirstRun", () => {
  it("asks one question and says what happens next", () => {
    renderWithApi(<FirstRun onDone={() => undefined} />, mockApi({ fresh: true }));
    expect(screen.getByRole("heading", { level: 1, name: "Ne kadar parayla başlıyorsun?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Başlangıç paran" })).toHaveFocus();
    expect(screen.getByText("Bundan sonra ne olur?")).toBeInTheDocument();
    expect(screen.getByText(/KAPtan hiçbir zaman kendi başına alıp satmaz\./)).toBeInTheDocument();
  });

  it("says in one plain line that an amount is missing, and sends nothing", async () => {
    const api = mockApi({ fresh: true });
    const spy = vi.spyOn(api, "moveMoney");
    renderWithApi(<FirstRun onDone={() => undefined} />, api);
    await user().click(screen.getByRole("button", { name: "Bu parayla başla" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Bir tutar yaz.");
    expect(spy).not.toHaveBeenCalled();
  });

  it("groups the lira as it is typed and reads the amount back in words", async () => {
    renderWithApi(<FirstRun onDone={() => undefined} />, mockApi({ fresh: true }));
    await user().type(screen.getByRole("textbox", { name: "Başlangıç paran" }), "25000");
    expect(screen.getByRole("textbox", { name: "Başlangıç paran" })).toHaveValue("25.000");
    expect(screen.getByText("Yirmi beş bin lira.")).toBeInTheDocument();
  });

  it("saves the start money, then asks about shares, and finishing marks the first visit as read", async () => {
    const u = user();
    const api = mockApi({ fresh: true });
    const done = vi.fn();
    renderWithApi(<FirstRun onDone={done} />, api);
    await u.type(screen.getByRole("textbox", { name: "Başlangıç paran" }), "50000");
    await u.click(screen.getByRole("button", { name: "Bu parayla başla" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Elinde zaten hisse var mı?" })).toBeInTheDocument();
    expect((await api.overview()).needs_setup).toBe(false);
    await u.click(screen.getByRole("button", { name: "Hayır, ana sayfaya geç" }));
    expect(done).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(HOWTO_KEY)).toBe("1");
  });

  it("adds a share you already hold and offers another one", async () => {
    const u = user();
    renderWithApi(<FirstRun onDone={() => undefined} />, mockApi({ fresh: true }));
    await u.type(screen.getByRole("textbox", { name: "Başlangıç paran" }), "50000");
    await u.click(screen.getByRole("button", { name: "Bu parayla başla" }));
    await u.click(await screen.findByRole("button", { name: "Evet, hisse ekleyeyim" }));
    await u.type(screen.getByLabelText("Hisse kodu"), "krgcl");
    await u.type(screen.getByLabelText("Kaç adet?"), "10");
    await u.type(screen.getByLabelText("Tanesini kaç liradan aldın?"), "30");
    await u.clear(screen.getByLabelText("Ne zaman aldın?"));
    await u.type(screen.getByLabelText("Ne zaman aldın?"), "2027-01-04");
    await u.click(screen.getByRole("button", { name: "Hisseyi ekle" }));
    expect(await screen.findByText("eklendi: 10 adet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Başka bir hisse ekle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tamam, ana sayfaya geç" })).toBeInTheDocument();
  });

  it("goes on to the shares when the money was already entered (another tab, a double press)", async () => {
    const api: KaptanApi = { ...mockApi({ fresh: true }), moveMoney: () => Promise.reject(new ApiError(409, "already_started", "Başlangıç paranı zaten girdin.")) };
    const u = user();
    renderWithApi(<FirstRun onDone={() => undefined} />, api);
    await u.type(screen.getByRole("textbox", { name: "Başlangıç paran" }), "100");
    await u.click(screen.getByRole("button", { name: "Bu parayla başla" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Elinde zaten hisse var mı?" })).toBeInTheDocument();
  });

  it("shows the server's own sentence when saving fails", async () => {
    const api: KaptanApi = { ...mockApi({ fresh: true }), moveMoney: () => Promise.reject(new ApiError(500, "boom", "Kaydedemedim.")) };
    const u = user();
    renderWithApi(<FirstRun onDone={() => undefined} />, api);
    await u.type(screen.getByRole("textbox", { name: "Başlangıç paran" }), "100");
    await u.click(screen.getByRole("button", { name: "Bu parayla başla" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Kaydedemedim."));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ne kadar parayla başlıyorsun?");
  });
});
