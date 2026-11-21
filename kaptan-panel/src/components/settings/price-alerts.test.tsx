import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { movePrice } from "@/lib/api/mock/alerts-more";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { AlertHistorySection, historySentence } from "./alert-history-section";
import { MutedSection, mutedSentence, withMuted } from "./muted-section";
import { priceAlertBody } from "./price-alert-watch";
import {
  buildInput,
  nowLine,
  priceAlertsSentence,
  waitsFor,
} from "./price-alerts-words";
import { PriceAlertsSection } from "./price-alerts-section";
import { RestoreSection, ageText, restoreSentence } from "./restore-section";

vi.mock("next/navigation", async () =>
  (await import("../nav.test-utils")).mockNavigation(),
);

const user = () => userEvent.setup({ delay: null });

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  nav.push.mockReset();
  window.localStorage.clear();
});

describe("price alert words", () => {
  it("builds the request a form means, or says what is missing", () => {
    expect(buildInput("thyao", "up5", "")).toEqual({
      ok: true,
      input: { ticker: "THYAO", direction: "above", preset_pct: 5 },
    });
    expect(buildInput("THYAO", "down10", "")).toEqual({
      ok: true,
      input: { ticker: "THYAO", direction: "below", preset_pct: 10 },
    });
    expect(buildInput("THYAO", "below", "48,50")).toEqual({
      ok: true,
      input: { ticker: "THYAO", direction: "below", level: 48.5 },
    });
    expect(buildInput("TH", "up5", "")).toEqual({
      ok: false,
      error: "Hisse kodunu yaz (ör. THYAO).",
    });
    expect(buildInput("THYAO", "above", "abc")).toEqual({
      ok: false,
      error: "Bir fiyat yaz (ör. 300 ya da 48,50).",
    });
  });

  it("says what an alert waits for, in plain words", () => {
    expect(waitsFor({ direction: "above", level: 105, preset_pct: 5 })).toMatch(
      /^Yüzde 5 yükselirse \(105,00.TL\)$/,
    );
    expect(
      waitsFor({ direction: "below", level: 40, preset_pct: null }),
    ).toMatch(/^40,00.TL altına inerse$/);
    expect(priceAlertsSentence(null)).toBe("Fiyat uyarılarına bakıyorum…");
    expect(priceAlertsSentence([])).toBe("Bekleyen bir fiyat uyarın yok.");
  });

  it("the desktop text names the company, which never leaves this computer", () => {
    expect(
      priceAlertBody({
        name: "MİSAL ENERJİ A.Ş.",
        ticker: "ORNEK",
        direction: "above",
        price: 61,
      }),
    ).toMatch(/^MİSAL ENERJİ A\.Ş\. \(ORNEK\) yükseldi: 61,00.TL\./);
  });

  it("history, muting and backup sentences", () => {
    expect(historySentence([])).toBe(
      "Henüz telefonuna ya da e-postana bir şey gönderilmedi.",
    );
    expect(mutedSentence([])).toBe("Hiçbir şirketi susturmadın.");
    expect(withMuted(["THYAO"], " asels ")).toEqual(["THYAO", "ASELS"]);
    expect(withMuted(["THYAO"], "thyao")).toEqual(["THYAO"]);
    expect(ageText(0)).toBe("bugün");
    expect(ageText(3)).toBe("3 gün önce");
    expect(
      nowLine({
        id: "1",
        ticker: "A",
        name: "A",
        direction: "above",
        level: 10,
        preset_pct: null,
        created_at: "2026-11-21T10:00:00.000Z",
        triggered_at: null,
        triggered_price: null,
        current_price: null,
        current_at: null,
      }),
    ).toMatch(/henüz bir fiyatım yok/);
    expect(restoreSentence(null)).toBe("Yedeklerine bakıyorum…");
  });
});

describe("Ayarlar · Fiyat uyarıları", () => {
  it("makes an alert, shows it with the price now, and removes it", async () => {
    const u = user();
    renderWithDesk(<PriceAlertsSection />);
    expect(
      await screen.findByText("Bekleyen bir fiyat uyarın yok."),
    ).toBeInTheDocument();
    await u.type(screen.getByLabelText("Hangi hisse?"), "ORNEK");
    await u.click(screen.getByRole("button", { name: "Uyarı kur" }));
    const list = await screen.findByRole("list", { name: "Fiyat uyarıların" });
    expect(within(list).getByText(/Yüzde 5 yükselirse/)).toBeInTheDocument();
    expect(screen.getByText("1 fiyat uyarın bekliyor.")).toBeInTheDocument();
    await u.click(
      within(list).getByRole("button", { name: "ORNEK uyarısını kaldır" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("list", { name: "Fiyat uyarıların" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("an unknown code and a missing price read as one plain line", async () => {
    const u = user();
    renderWithDesk(<PriceAlertsSection />);
    await u.type(await screen.findByLabelText("Hangi hisse?"), "YOKXX");
    await u.click(screen.getByRole("button", { name: "Uyarı kur" }));
    expect(
      await screen.findByText("Bu kodla bir şirket bulamadım."),
    ).toBeInTheDocument();
  });
});

describe("Ayarlar · geçmiş, sustur, yedekten dön", () => {
  it("lists what went out after an alert fired, without the company", async () => {
    const db = new MockDb(null);
    renderWithDesk(<AlertHistorySection />, db);
    expect(
      await screen.findByText(
        "Henüz telefonuna ya da e-postana bir şey gönderilmedi.",
      ),
    ).toBeInTheDocument();
    cleanupFire(db);
  });

  it("mutes a company and un-mutes it, saving at once", async () => {
    const u = user();
    renderWithDesk(<MutedSection />);
    await u.type(await screen.findByLabelText("Hangi şirket?"), "orncm");
    const mute = screen.getByRole("button", { name: "Sustur" });
    await waitFor(() => expect(mute).toBeEnabled());
    await u.click(mute);
    const list = await screen.findByRole("list", {
      name: "Susturduğun şirketler",
    });
    expect(within(list).getByText("ORNCM")).toBeInTheDocument();
    expect(
      screen.getByText("1 şirketten telefona ve bu bilgisayara haber gitmez."),
    ).toBeInTheDocument();
    await u.click(
      within(list).getByRole("button", { name: "ORNCM şirketinin sesini aç" }),
    );
    expect(
      await screen.findByText("Hiçbir şirketi susturmadın."),
    ).toBeInTheDocument();
  });

  it("shows the backups with their age and the safe steps; there is no restore button", async () => {
    renderWithDesk(<RestoreSection />);
    const files = await screen.findByRole("list", { name: "Yedekler" });
    expect(within(files).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.getByText("Yedekten nasıl dönerim?")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /geri yükle|dön$/i }),
    ).not.toBeInTheDocument();
  });
});

function cleanupFire(db: MockDb) {
  expect(movePrice(db, "ORNEK", 50)).toBe(0);
}
