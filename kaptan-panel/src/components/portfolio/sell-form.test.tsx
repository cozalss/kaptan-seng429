import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Position } from "@/lib/domain";
import { mockApi, renderWithApi } from "@/components/solo/money.test-utils";
import { SellForm } from "./sell-form";

const user = () => userEvent.setup({ delay: null });

async function setup() {
  const api = mockApi({ fresh: true });
  await api.moveMoney({ kind: "start", amount_try: 10_000 });
  const position = await api.addHolding({ ticker: "KRGCL", qty: 10, avg_cost: 30, bought_on: "2027-01-04" });
  const onSold = vi.fn<(left: Position | null, draft: { qty: string; price: string; commission: string }) => void>();
  const onCancel = vi.fn();
  renderWithApi(<SellForm position={position} onSold={onSold} onCancel={onCancel} />, api);
  return { api, position, onSold, onCancel };
}

describe("SellForm", () => {
  it("asks how many, at what price and what the bank charged, and says how many you hold", async () => {
    await setup();
    expect(screen.getByRole("form", { name: "KRGCL satışı" })).toBeInTheDocument();
    expect(screen.getByLabelText("Kaç adet sattın?")).toHaveFocus();
    expect(screen.getByText("Elinde 10 adet var.")).toBeInTheDocument();
    expect(screen.getByLabelText("Tanesini kaç liradan sattın?")).toBeInTheDocument();
    expect(screen.getByText(/Boş bırakabilirsin; o zaman KAPtan tahmin eder ve bunu sana söyler\./)).toBeInTheDocument();
  });

  it("says what is missing and sends nothing", async () => {
    const { api, onSold } = await setup();
    const spy = vi.spyOn(api, "sellHolding");
    await user().click(screen.getByRole("button", { name: "Satışı kaydet" }));
    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(2);
    expect(spy).not.toHaveBeenCalled();
    expect(onSold).not.toHaveBeenCalled();
  });

  it("will not take more than you hold", async () => {
    const u = user();
    const { api } = await setup();
    const spy = vi.spyOn(api, "sellHolding");
    await u.type(screen.getByLabelText("Kaç adet sattın?"), "11");
    await u.type(screen.getByLabelText("Tanesini kaç liradan sattın?"), "35");
    await u.click(screen.getByRole("button", { name: "Satışı kaydet" }));
    expect(screen.getByText("Elinde 10 adet var; fazlasını satamazsın.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("writes a part sale with the bank's commission and returns what is left", async () => {
    const u = user();
    const { api, position, onSold } = await setup();
    await u.type(screen.getByLabelText("Kaç adet sattın?"), "4");
    await u.type(screen.getByLabelText("Tanesini kaç liradan sattın?"), "35");
    await u.type(screen.getByLabelText("Bankan ne kadar komisyon kesti?"), "2,5");
    await u.click(screen.getByRole("button", { name: "Satışı kaydet" }));
    await waitFor(() => expect(onSold).toHaveBeenCalledTimes(1));
    expect(onSold.mock.calls[0]?.[0]).toMatchObject({ id: position.id, qty: 6 });
    expect(onSold.mock.calls[0]?.[1]).toMatchObject({ qty: "4", commission: "2,5" });
    // 4 × 35 − 2,50 comes back to the cash.
    expect((await api.money()).cash).toBeCloseTo(10_000 + 4 * 35 - 2.5, 2);
  });

  it("a sale of everything leaves nothing", async () => {
    const u = user();
    const { onSold } = await setup();
    await u.type(screen.getByLabelText("Kaç adet sattın?"), "10");
    await u.type(screen.getByLabelText("Tanesini kaç liradan sattın?"), "35");
    await u.click(screen.getByRole("button", { name: "Satışı kaydet" }));
    await waitFor(() => expect(onSold).toHaveBeenCalledTimes(1));
    expect(onSold.mock.calls[0]?.[0]).toBeNull();
  });

  it("Vazgeç goes back without writing", async () => {
    const { api, onCancel } = await setup();
    const spy = vi.spyOn(api, "sellHolding");
    await user().click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onCancel).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });
});
