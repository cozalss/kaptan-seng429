import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { PauseNotice } from "../solo/pause-notice";
import { AccountSection, changedSentence, newPasswordProblem } from "./account-section";
import { AlertPrefsSection } from "./alert-prefs-section";
import { PauseSection } from "./pause-section";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  nav.push.mockReset();
  window.localStorage.clear();
});

describe("the new password's rules", () => {
  it("say what is wrong, in words", () => {
    expect(newPasswordProblem("kısa", "kısa")).toBe("Yeni parola en az 6 karakter olmalı.");
    expect(newPasswordProblem("yeni-parola", "yeni-parolx")).toBe("İki parola aynı değil.");
    expect(newPasswordProblem("yeni-parola", "yeni-parola")).toBeNull();
    expect(changedSentence(0)).toBe("Parolan değişti.");
    expect(changedSentence(2)).toBe("Parolan değişti. Diğer cihazlardaki 2 oturum kapandı.");
  });
});

describe("Hesabın · parola", () => {
  it("changes the password, and the API's refusal reads as a plain line", async () => {
    const u = user();
    renderWithDesk(<AccountSection />);
    const current = screen.getByLabelText("Şimdiki parolan");
    await u.type(current, "yanlış-parola");
    await u.type(screen.getByLabelText("Yeni parolan"), "yeni-parolam");
    await u.type(screen.getByLabelText("Yeni parolayı bir daha yaz"), "yeni-parolam");
    await u.click(screen.getByRole("button", { name: "Parolayı değiştir" }));
    expect(await screen.findByText("Şimdiki parolan doğru değil.")).toBeInTheDocument();

    await u.clear(current);
    await u.type(current, "kaptan2026");
    await u.click(screen.getByRole("button", { name: "Parolayı değiştir" }));
    expect(await screen.findByText("Parolan değişti.")).toBeInTheDocument();
    expect(current).toHaveValue(""); // nothing stays on the screen
  });

  it("does not ask the API for two different new passwords", async () => {
    const u = user();
    renderWithDesk(<AccountSection />);
    await u.type(screen.getByLabelText("Şimdiki parolan"), "kaptan2026");
    await u.type(screen.getByLabelText("Yeni parolan"), "yeni-parolam");
    await u.type(screen.getByLabelText("Yeni parolayı bir daha yaz"), "baska-parola");
    await u.click(screen.getByRole("button", { name: "Parolayı değiştir" }));
    expect(await screen.findByText("İki parola aynı değil.")).toBeInTheDocument();
  });

  it("signs out everywhere after a confirmation and goes to the sign-in", async () => {
    const u = user();
    const { db } = renderWithDesk(<AccountSection />);
    await u.click(screen.getByRole("button", { name: "Her yerden çıkış yap" }));
    await u.click(await screen.findByRole("button", { name: "Evet, her yerden çık" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/login"));
    expect(db.auditChain().map((e) => e.action)).toContain("auth.signed_out_everywhere");
  });
});

describe("Tatil modu", () => {
  it("pauses, says until when on the home, and resumes from either place", async () => {
    const u = user();
    const db = new MockDb(null);
    renderWithDesk(<PauseSection />, db);
    await u.click(await screen.findByRole("button", { name: "7 gün ara ver" }));
    expect(await screen.findByRole("button", { name: "Şimdi devam et" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Tatil modu açık\. Bitiş: / })).toBeInTheDocument();
  });

  it("shows a notice on the home only while paused, with the way back", async () => {
    const u = user();
    const db = new MockDb(null);
    const { unmount } = renderWithDesk(<PauseNotice />, db);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Tatil modu" })).toBeNull());
    unmount();

    db.update((s) => ({ ...s, comfort: { ...s.comfort, pauseSince: db.nowIso(), pauseUntil: new Date(Date.parse(db.nowIso()) + 3 * 86_400_000).toISOString() } }));
    renderWithDesk(<PauseNotice />, db);
    const notice = await screen.findByRole("region", { name: "Tatil modu" });
    expect(notice).toHaveTextContent(/ara verdi: bildirimleri okuyor, öneri getirmiyor/);
    await u.click(screen.getByRole("button", { name: "Şimdi devam et" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Tatil modu" })).toBeNull());
  });
});

describe("Hangi bildirim nereye", () => {
  it("saves each change at once and keeps this computer's copy", async () => {
    const u = user();
    const { db } = renderWithDesk(<AlertPrefsSection />);
    const phone = await screen.findByRole("checkbox", { name: "Sistem sorunu: telefon ve e-posta" });
    expect(phone).toBeChecked();
    await u.click(phone);
    expect(await screen.findByText("Kaydedildi.")).toBeInTheDocument();
    expect(phone).not.toBeChecked();
    expect(JSON.parse(window.localStorage.getItem("kaptan_alert_prefs") ?? "{}").kinds.part_down.phone).toBe(false);

    await u.click(screen.getByRole("checkbox", { name: "Sessiz saatler" }));
    await waitFor(() => expect(screen.getByLabelText("Başlangıç")).toBeEnabled());
    expect(db.snapshot.comfort.alerts.quiet.on).toBe(true);
  });
});
