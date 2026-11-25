import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsReset } from "@/lib/domain/telegram";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { createMockApi } from "@/lib/api/mock/mock-api";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { defaultAlertPrefs } from "@/lib/prefs/alert-defaults";
import { readLook } from "@/lib/prefs/look";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { SettingsScreen } from "./settings-screen";
import { accountSummary, lookSummary, moneySummary, notifySummary, RESET_DONE, RESET_WILL, RESET_WONT } from "./settings-words";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });
const telegram = { paired: false } as never;

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  nav.pathname = "/ayarlar";
  window.localStorage.clear();
});

describe("the one line of each group", () => {
  it("says what is set now, in plain words", () => {
    const alerts = { ...defaultAlertPrefs(), quiet: { on: true, start: "23:00", end: "08:00" } };
    expect(notifySummary({ telegram, desktopOn: true, alerts, pause: null })).toBe("Telegram bağlı değil · Masaüstü bildirimleri açık · Sessiz saatler 23:00–08:00");
    expect(notifySummary({ telegram: { paired: true } as never, desktopOn: false, alerts: defaultAlertPrefs(), pause: { active: true, until: null, since: null } })).toBe(
      "Telegram bağlı · Masaüstü bildirimleri kapalı · Sessiz saat yok · Tatil modu açık",
    );
    expect(notifySummary({ telegram: null, desktopOn: false, alerts: null, pause: null })).toContain("bakıyorum");
    expect(moneySummary(6)).toBe("6 sınır seni koruyor");
    expect(moneySummary(0)).toBe("Henüz bir sınırın yok");
    expect(lookSummary({ theme: "dark", text: "large" })).toBe("Tema: Koyu · Yazı: Büyük");
    expect(accountSummary(null, null)).toBe("Yedeğe bakıyorum…");
  });

  it("lists exactly what the reset changes and what it never touches", () => {
    expect(RESET_WILL).toHaveLength(7);
    expect(RESET_WONT).toMatch(/paran.*hisseler.*kayıp sınırların.*parolan.*geçmiş.*Telegram bağlantın.*yedeklerin/);
  });
});

describe("mock · Ayarları sıfırla", () => {
  it("puts the settings back, keeps Telegram paired and writes one audit row", async () => {
    const db = new MockDb(null);
    const api = createMockApi({ db, latencyMs: 0, live: false });
    await api.saveAlertPrefs({ ...defaultAlertPrefs(), muted: ["THYAO"], quiet: { on: true, start: "23:00", end: "07:00" } });
    await api.startPause({ days: 2 });
    await api.saveTelegram({ level: "more", daily_cap: 20 });
    const done = await api.resetSettings();
    expect(SettingsReset.safeParse(done).success).toBe(true);
    expect(done.preferences.alerts).toEqual(defaultAlertPrefs());
    expect(done.preferences.pause.active).toBe(false);
    expect([done.telegram.level, done.telegram.daily_cap]).toEqual(["normal", 8]);
    expect(db.auditChain().filter((e) => e.action === "settings.reset")).toHaveLength(1);
  });
});

describe("Ayarlar · sıfırla", () => {
  it("asks first, then clears this browser's settings and says so", async () => {
    const u = user();
    window.localStorage.setItem("kaptan_theme", "dark");
    window.localStorage.setItem("kaptan_text", "large");
    window.localStorage.setItem("kaptan_howto_seen", "1");
    window.localStorage.setItem("kaptan-solo-holds", "[]");
    const { db } = renderWithDesk(<SettingsScreen />, new MockDb(null));
    await u.click(await screen.findByRole("button", { name: "Görünüm: değiştir" }));
    await u.click(screen.getAllByTestId("reset-open").at(-1)!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(RESET_WONT)).toBeInTheDocument();
    expect(db.auditChain().some((e) => e.action === "settings.reset")).toBe(false); // nothing happens before the answer
    await u.click(within(dialog).getByRole("button", { name: "Evet, sıfırla" }));
    await waitFor(() => expect(screen.getByTestId("reset-notice")).toHaveTextContent(RESET_DONE));
    expect(db.auditChain().filter((e) => e.action === "settings.reset")).toHaveLength(1);
    expect(readLook(window.localStorage)).toEqual({ theme: "system", text: "normal" });
    expect(window.localStorage.getItem("kaptan_howto_seen")).toBeNull();
    expect(window.localStorage.getItem("kaptan-solo-holds")).toBe("[]"); // answers about holdings are not settings
  });
});
