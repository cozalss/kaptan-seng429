import type { AlertSettings } from "@/lib/domain";
import { alertsSentence, channelWords, desktopWords, lastResult, PHONE_SETUP_STEPS, testOutcome } from "./alerts-words";

const none: AlertSettings = { ntfy: false, email: false, last_sent_at: null, last_error_tr: null };

describe("alerts words", () => {
  it("answers 'can KAPtan reach you' in one sentence", () => {
    expect(alertsSentence(false, none)).toBe("Sana henüz haber veremiyorum.");
    expect(alertsSentence(true, none)).toBe("Öneri gelince sana haber veriyorum.");
    expect(alertsSentence(false, { ...none, ntfy: true })).toBe("Öneri gelince sana haber veriyorum.");
    expect(alertsSentence(false, null)).toBe("Sana nasıl haber vereyim?");
  });

  it("has exactly three setup steps and names the installer file", () => {
    expect(PHONE_SETUP_STEPS).toHaveLength(3);
    expect(PHONE_SETUP_STEPS[1]).toContain("kur.cmd");
  });

  it("shows the API's own failure sentence once, without repeating it", () => {
    const failed = { ...none, ntfy: true, last_error_tr: "Telefon bildirimi gönderilemedi." };
    expect(testOutcome(failed)).toEqual({ ok: false, text: "Telefon bildirimi gönderilemedi." });
    expect(lastResult(failed)?.ok).toBe(false);
    expect(testOutcome({ ...none, ntfy: true }).ok).toBe(true);
    expect(lastResult(none)).toBeNull();
  });

  it("says which channels are set up, and never the topic or address", () => {
    expect(channelWords("ntfy", { ...none, ntfy: true }, null).state).toBe("Kurulu.");
    expect(channelWords("email", none, null).state).toBe("Kurulu değil.");
    expect(channelWords("ntfy", null, "Bağlantı yok.").detail).toBe("Bağlantı yok.");
  });

  it("explains a refused or missing browser permission", () => {
    expect(desktopWords(false, "unsupported").action).toBeNull();
    expect(desktopWords(false, "denied").action).toBe("Yeniden dene");
    expect(desktopWords(false, "default").action).toBe("Bu bilgisayarda aç");
    expect(desktopWords(true, "granted").action).toBe("Kapat");
  });
});
