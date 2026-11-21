import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiProvider } from "@/lib/api/react";
import { ApiError, type KaptanApi } from "@/lib/api/types";
import { mockApi, renderWithApi } from "@/components/solo/money.test-utils";
import { HoldingForm } from "./holding-form";

const user = () => userEvent.setup({ delay: null });

async function started(): Promise<KaptanApi> {
  const api = mockApi({ fresh: true });
  await api.moveMoney({ kind: "start", amount_try: 10_000 });
  return api;
}

async function fill(u: ReturnType<typeof user>, ticker: string, qty: string, cost: string, day = "2027-01-04") {
  await u.type(screen.getByLabelText("Hisse kodu"), ticker);
  await u.type(screen.getByLabelText("Kaç adet?"), qty);
  await u.type(screen.getByLabelText("Tanesini kaç liradan aldın?"), cost);
  if (day) {
    await u.clear(screen.getByLabelText("Ne zaman aldın?"));
    await u.type(screen.getByLabelText("Ne zaman aldın?"), day);
  }
}

describe("HoldingForm", () => {
  it("puts the cursor on the first question", async () => {
    renderWithApi(<HoldingForm onAdded={() => undefined} />, await started());
    expect(screen.getByLabelText("Hisse kodu")).toHaveFocus();
  });

  it("starts the day at today", async () => {
    renderWithApi(<HoldingForm onAdded={() => undefined} />, await started());
    expect((screen.getByLabelText("Ne zaman aldın?") as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("says under each field what is missing once you press the button, and sends nothing", async () => {
    const api = await started();
    const spy = vi.spyOn(api, "addHolding");
    const onAdded = vi.fn();
    renderWithApi(<HoldingForm onAdded={onAdded} />, api);
    await user().click(screen.getByRole("button", { name: "Hisseyi ekle" }));
    expect(screen.getByText(/Hisse kodunu yaz; 3 ile 6 harf/)).toBeInTheDocument();
    expect(screen.getByText("Kaç adet olduğunu yaz.")).toBeInTheDocument();
    expect(screen.getByText("Tanesini kaç liradan aldığını yaz.")).toBeInTheDocument();
    expect(screen.queryByText("Aldığın günün tarihini seç.")).not.toBeInTheDocument(); // the day starts as today
    expect(spy).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("types the code in capitals and adds the share at what you paid", async () => {
    const u = user();
    const api = await started();
    const onAdded = vi.fn();
    renderWithApi(<HoldingForm onAdded={onAdded} />, api);
    await fill(u, "krgcl", "10", "30");
    expect(screen.getByLabelText("Hisse kodu")).toHaveValue("KRGCL");
    await u.click(screen.getByRole("button", { name: "Hisseyi ekle" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(onAdded.mock.calls[0]?.[0]).toMatchObject({ ticker: "KRGCL", qty: 10, avg_cost: 30, origin: "own" });
    // The form is empty again for the next one.
    expect(screen.getByLabelText("Hisse kodu")).toHaveValue("");
  });

  it("shows the server's sentence for a code it does not know", async () => {
    const u = user();
    renderWithApi(<HoldingForm onAdded={() => undefined} />, await started());
    await fill(u, "ZZZZZ", "1", "5");
    await u.click(screen.getByRole("button", { name: "Hisseyi ekle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bu hisse kodunu tanımıyorum.");
  });

  it("offers close codes for a code it does not know, and a pick puts it in the field", async () => {
    const u = user();
    renderWithApi(<HoldingForm onAdded={() => undefined} />, await started());
    await fill(u, "KRGCX", "1", "5");
    await u.click(screen.getByRole("button", { name: "Hisseyi ekle" }));
    const list = await screen.findByRole("list", { name: "Benzer hisse kodları" });
    const pick = within(list).getByRole("button", { name: /KRGCL/ });
    await u.click(pick);
    expect(screen.getByLabelText("Hisse kodu")).toHaveValue("KRGCL");
    expect(screen.queryByRole("list", { name: "Benzer hisse kodları" })).not.toBeInTheDocument();
  });

  it("refuses a day in the future before asking the server", async () => {
    const u = user();
    const api = await started();
    const spy = vi.spyOn(api, "addHolding");
    renderWithApi(<HoldingForm onAdded={() => undefined} />, api);
    await fill(u, "KRGCL", "1", "5", "2999-01-01");
    await u.click(screen.getByRole("button", { name: "Hisseyi ekle" }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("shows any other failure in words and keeps what you typed", async () => {
    const u = user();
    const api: KaptanApi = { ...(await started()), addHolding: () => Promise.reject(new ApiError(409, "not_started", "Önce başlangıç paranı gir.")) };
    renderWithApi(<HoldingForm onAdded={() => undefined} />, api);
    await fill(u, "KRGCL", "4", "5");
    await u.click(screen.getByRole("button", { name: "Hisseyi ekle" }));
    expect(await screen.findByText("Önce başlangıç paranı gir.")).toBeInTheDocument();
    expect(screen.getByLabelText("Kaç adet?")).toHaveValue("4");
  });

  it("offers Vazgeç only when someone listens", async () => {
    const onCancel = vi.fn();
    const api = await started();
    const { rerender } = renderWithApi(<HoldingForm onAdded={() => undefined} onCancel={onCancel} />, api);
    await user().click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onCancel).toHaveBeenCalled();
    rerender(
      <ApiProvider api={api}>
        <HoldingForm onAdded={() => undefined} />
      </ApiProvider>,
    );
    expect(screen.queryByRole("button", { name: "Vazgeç" })).toBeNull();
  });
});
