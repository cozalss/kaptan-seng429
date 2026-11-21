import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MoneyBook } from "@/lib/solo/money";
import { mockApi, renderWithApi } from "@/components/solo/money.test-utils";
import { MoneySection } from "./money-section";

const user = () => userEvent.setup({ delay: null });

async function setup() {
  const api = mockApi({ fresh: true });
  await api.moveMoney({ kind: "start", amount_try: 10_000 });
  const book = await api.money();
  const onChanged = vi.fn();
  renderWithApi(<MoneySection book={book} onChanged={onChanged} />, api);
  return { api, book, onChanged };
}

const book = (over: Partial<MoneyBook> = {}): MoneyBook => ({ cash: 0, put_in: 0, movements: [], ...over });

describe("MoneySection", () => {
  it("says what you put in and what is free cash, with the three things you can do", async () => {
    await setup();
    expect(screen.getByRole("heading", { name: /^Şimdiye kadar 10\.000.₺ koydun\.$/ })).toBeInTheDocument();
    expect(screen.getByText(/şu an nakit duruyor/)).toBeInTheDocument();
    for (const name of ["Para ekle", "Para çek", "Elindeki bir hisseyi ekle"]) expect(screen.getByRole("button", { name })).toBeEnabled();
    expect(screen.getByText(/ile başladın\./)).toBeInTheDocument();
  });

  it("waits quietly, with the buttons off, until the book has loaded", () => {
    renderWithApi(<MoneySection book={null} onChanged={() => undefined} />, mockApi({ fresh: true }));
    expect(screen.getByRole("heading")).toHaveTextContent("Koyduğun parayı getiriyorum…");
    expect(screen.getByRole("button", { name: "Para ekle" })).toBeDisabled();
  });

  it("adds money, tells what was written, reloads the screen and hands focus back to the button", async () => {
    const u = user();
    const { api, onChanged } = await setup();
    await u.click(screen.getByRole("button", { name: "Para ekle" }));
    await u.type(screen.getByRole("textbox", { name: "Ne kadar ekliyorsun?" }), "1000");
    await u.click(screen.getByRole("button", { name: "Parayı ekle" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/^1\.000.₺ ekledin\.$/));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect((await api.money()).put_in).toBe(11_000);
    await waitFor(() => expect(screen.getByRole("button", { name: "Para ekle" })).toHaveFocus());
  });

  it("shows the server's sentence when you withdraw more than the cash, and writes nothing", async () => {
    const u = user();
    const { api, onChanged } = await setup();
    await u.click(screen.getByRole("button", { name: "Para çek" }));
    await u.type(screen.getByRole("textbox", { name: "Ne kadar çekiyorsun?" }), "99999");
    await u.click(screen.getByRole("button", { name: "Parayı çek" }));
    expect(await screen.findByText("Elindeki nakitten fazlasını çekemezsin.")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    expect((await api.money()).cash).toBe(10_000);
  });

  it("asks for an amount instead of sending an empty form", async () => {
    const u = user();
    await setup();
    await u.click(screen.getByRole("button", { name: "Para ekle" }));
    await u.click(screen.getByRole("button", { name: "Parayı ekle" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Bir tutar yaz.");
  });

  it("opens one form at a time, and Vazgeç closes the share form without writing", async () => {
    const u = user();
    await setup();
    await u.click(screen.getByRole("button", { name: "Para ekle" }));
    await u.click(screen.getByRole("button", { name: "Elindeki bir hisseyi ekle" }));
    expect(screen.queryByRole("textbox", { name: "Ne kadar ekliyorsun?" })).toBeNull();
    expect(screen.getByRole("form", { name: "Elindeki hisseyi ekle" })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByRole("form", { name: "Elindeki hisseyi ekle" })).toBeNull();
  });

  it("shows the five newest movements and the rest behind one button", async () => {
    const movements = Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, kind: "deposit" as const, amount_try: 100 + i, occurred_at: "2027-01-05T09:00:00.000Z", note: "", status: "active" as const, original_amount_try: null, changed_at: null }));
    const u = user();
    renderWithApi(<MoneySection book={book({ cash: 1, put_in: 1, movements })} onChanged={() => undefined} />, mockApi({ fresh: true }));
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(5);
    await u.click(screen.getByRole("button", { name: "Hepsini göster (7)" }));
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Son birkaçını göster" })).toBeInTheDocument();
  });
});
