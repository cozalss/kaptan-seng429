import { describe, expect, it } from "vitest";
import type { TelegramStatus } from "@/lib/domain/telegram";
import { agoWords, CAP_CHOICES, capSentence, CLOUD_SETUP_STEPS, cloudSentence, cloudWarning, LEVEL_HINT, LEVEL_LABEL, LEVELS, SAMPLE_BUTTON, TELEGRAM_LEAD, TELEGRAM_STEPS, telegramSentence } from "./telegram-words";

const base: TelegramStatus = {
  configured: false, token_from_env: false, bot_username: null, paired: false, pairing_open: false,
  pairing_expires_at: null, level: "normal", daily_cap: 8, silent_until: null, last_sent_at: null,
  cloud_on: false, cloud_synced_at: null, cloud_message_at: null, cloud_kap: null, cloud_error: false,
};

describe("Telegram words", () => {
  it("says where the pairing is", () => {
    expect(telegramSentence(null)).toBe("Telegram’a bakıyorum…");
    expect(telegramSentence(base)).toContain("haber verebilirim");
    expect(telegramSentence({ ...base, pairing_open: true })).toContain("bağlantıya dokunmanı");
    expect(telegramSentence({ ...base, paired: true })).toContain("haber veriyorum");
  });
  it("has the four steps, the three levels and the cap sentence", () => {
    expect(Object.keys(TELEGRAM_STEPS)).toHaveLength(4);
    expect(LEVELS.map((l) => LEVEL_LABEL[l])).toEqual(["Daha az", "Normal", "Daha çok"]);
    expect(LEVELS.every((l) => LEVEL_HINT[l].length > 20)).toBe(true);
    expect(CAP_CHOICES).toContain(8);
    expect(capSentence(8)).toBe("Günde en fazla 8 anlık mesaj. Fazlası sabah mesajına kalır.");
  });
  it("never says stop, and never names money", () => {
    const all = [TELEGRAM_LEAD, SAMPLE_BUTTON, ...Object.values(TELEGRAM_STEPS)].join(" ");
    expect(all).not.toMatch(/durdur/i);
    expect(TELEGRAM_LEAD).toContain("Paranı");
  });
});

describe("Bulut takibi words", () => {
  const on = { ...base, cloud_on: true, cloud_kap: "ok" as const };
  it("says how long ago, in plain Turkish", () => {
    const now = Date.parse("2026-11-24T12:00:00Z");
    expect(agoWords(null, now)).toBe("henüz yok");
    expect(agoWords("2026-11-24T11:59:40Z", now)).toBe("az önce");
    expect(agoWords("2026-11-24T11:48:00Z", now)).toBe("12 dakika önce");
    expect(agoWords("2026-11-24T09:00:00Z", now)).toBe("3 saat önce");
    expect(agoWords("2026-11-21T09:00:00Z", now)).toBe("3 gün önce");
  });
  it("is on or off, and warns only when something is wrong", () => {
    expect(cloudSentence(base)).toBe("Bulut takibi kapalı.");
    expect(cloudSentence(on)).toBe("Bulut takibi açık.");
    expect(cloudWarning(base)).toBeNull();
    expect(cloudWarning(on)).toBeNull();
    expect(cloudWarning({ ...on, cloud_kap: "blocked" })).toContain("engelliyor");
    expect(cloudWarning({ ...on, cloud_error: true })).toContain("ulaşışım");
    expect(cloudWarning({ ...on, cloud_kap: "unknown" })).toContain("henüz öğrenemedim");
  });
  it("asks the person for three things and shows no secret or address", () => {
    expect(Object.keys(CLOUD_SETUP_STEPS)).toHaveLength(3);
    expect(CLOUD_SETUP_STEPS.one).toContain("kart istemez");
    expect(Object.values(CLOUD_SETUP_STEPS).join(" ")).not.toMatch(/durdur|workers\.dev|secret/i);
  });
});
