import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithApi } from "@/components/solo/money.test-utils";
import { nav } from "../nav.test-utils";
import { BookTools, isResetWord } from "./book-tools";
import { MoneySection } from "./money-section";
import { useApiQuery } from "@/lib/api/react";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });

/** The section the way Param holds it: it reloads the book after every change. */
function Holder() {
  const q = useApiQuery((api) => api.money(), []);
  return <MoneySection book={q.data ?? null} onChanged={() => void q.refetch()} />;
}

async function started() {
  const api = mockApi({ fresh: true });
  await api.moveMoney({ kind: "start", amount_try: 10_000 });
  await api.moveMoney({ kind: "deposit", amount_try: 2_000 });
  return api;
}

describe("fixing the money log", () => {
  it("changes the starting money and says what it was before", async () => {
    const u = user();
    const api = await started();
    renderWithApi(<Holder />, api);
    const item = (await screen.findByText(/ile başladın\./)).closest("li") as HTMLElement;
    await u.click(within(item).getByRole("button", { name: /Başlangıç parasını değiştir/ }));
    const field = screen.getByRole("textbox", { name: "Başlangıç paran ne kadardı?" });
    await u.clear(field);
    await u.type(field, "15000");
    await u.click(screen.getByRole("button", { name: "Düzeltmeyi kaydet" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Düzelttin/));
    expect((await api.money()).put_in).toBe(17_000);
    const row = (await screen.findByText(/İlk yazdığın/)).closest("li") as HTMLElement;
    expect(row).toHaveAttribute("data-status", "corrected");
    expect(row).toHaveTextContent(/15\.000.₺ ile başladın\. Düzeltildi\. İlk yazdığın: 10\.000.₺\./);
  });

  it("does not offer to undo the starting money, but does for a deposit; undone stays in the list", async () => {
    const u = user();
    const api = await started();
    renderWithApi(<Holder />, api);
    const start = (await screen.findByText(/ile başladın\./)).closest("li") as HTMLElement;
    expect(within(start).queryByRole("button", { name: /Bunu yanlış girdim/ })).toBeNull();
    const deposit = screen.getByText(/ekledin\./).closest("li") as HTMLElement;
    await u.click(within(deposit).getByRole("button", { name: /Bunu yanlış girdim/ }));
    await u.click(screen.getByRole("button", { name: "Evet, geri al" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Geri aldın/));
    expect((await api.money()).put_in).toBe(10_000);
    await waitFor(() => expect(document.querySelector('[data-status="undone"]')).not.toBeNull());
    expect(document.querySelector('[data-status="undone"]')).toHaveTextContent(/Geri alındı\./);
  });

  it("shows the server's sentence when a fix would take the cash below zero", async () => {
    const u = user();
    const api = await started();
    await api.moveMoney({ kind: "withdrawal", amount_try: 11_000 });
    renderWithApi(<Holder />, api);
    const start = (await screen.findByText(/ile başladın\./)).closest("li") as HTMLElement;
    await u.click(within(start).getByRole("button", { name: /Başlangıç parasını değiştir/ }));
    const field = screen.getByRole("textbox", { name: "Başlangıç paran ne kadardı?" });
    await u.clear(field);
    await u.type(field, "5000");
    await u.click(screen.getByRole("button", { name: "Düzeltmeyi kaydet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/eksiye düşerdi/);
    expect((await api.money()).put_in).toBe(1_000);
  });
});

describe("Baştan başla", () => {
  it("takes the word in any case, Turkish rules", () => {
    expect(isResetWord("BAŞTAN")).toBe(true);
    expect(isResetWord("  baştan ")).toBe(true);
    expect(isResetWord("bastan")).toBe(false);
    expect(isResetWord("")).toBe(false);
  });

  it("asks twice, says what stays, and only then closes the book and goes home", async () => {
    const u = user();
    const api = await started();
    renderWithApi(<BookTools />, api);
    await u.click(screen.getByRole("button", { name: "Baştan başla" }));
    expect(screen.getByText(/Eski defter silinmez/)).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "Devam et" }));
    await u.type(screen.getByRole("textbox", { name: /Onaylamak için/ }), "evet");
    await u.click(screen.getByRole("button", { name: "Defteri kapat ve baştan başla" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/baştan/);
    expect((await api.previousBooks()).length).toBe(0);
    const field = screen.getByRole("textbox", { name: /Onaylamak için/ });
    await u.clear(field);
    await u.type(field, "BAŞTAN");
    await u.click(screen.getByRole("button", { name: "Defteri kapat ve baştan başla" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/benim"));
    expect((await api.previousBooks()).length).toBe(1);
    expect((await api.overview()).needs_setup).toBe(true);
  });

  it("says before the word that a stop that is on stays on", async () => {
    const u = user();
    const api = await started();
    await api.killSwitch("Deneme için durdurdum");
    renderWithApi(<BookTools />, api);
    await u.click(screen.getByRole("button", { name: "Baştan başla" }));
    expect(await screen.findByText(/her şey durdurulmuş\. Baştan başlasan da durdurma açık kalır/)).toBeInTheDocument();
  });
});
