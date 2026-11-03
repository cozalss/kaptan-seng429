import type { AuditEntry } from "@/lib/domain";
import { dayGroups, dayHeading, historySentence, inVoice, voiceOf } from "./diary-words";

const at = (pos: number, iso: string, actor = "system:kap_poller", action = "disclosure.ingested"): AuditEntry =>
  ({ seq: pos, chain_pos: pos, occurred_at: iso, actor, action, entity_type: "x", entity_id: String(pos), run_id: null, strategy_version: null, payload: {}, prev_hash: "00", hash: "a".repeat(64) }) as AuditEntry;

describe("historySentence", () => {
  it("counts today's records in plain words", () => {
    expect(historySentence({ scope: "today", total: 124, searching: false })).toBe("Bugün 124 şey oldu; hepsi burada.");
    expect(historySentence({ scope: "today", total: 1, searching: false })).toBe("Bugün tek bir şey oldu; o da burada.");
    expect(historySentence({ scope: "today", total: 0, searching: false })).toBe("Bugün henüz bir şey olmadı.");
  });

  it("counts everything, and a search says what it found", () => {
    expect(historySentence({ scope: "all", total: 4812, searching: false })).toBe("Başından beri 4.812 şey oldu; hepsi burada.");
    expect(historySentence({ scope: "all", total: 12, searching: true })).toBe("Aramana uyan 12 kayıt var.");
    expect(historySentence({ scope: "today", total: 0, searching: true })).toBe("Aramana uyan kayıt yok.");
  });
});

describe("dayGroups", () => {
  it("cuts the diary by the Istanbul day, not the UTC one, keeping the order", () => {
    const rows = [at(3, "2027-01-11T22:00:00.000Z"), at(2, "2027-01-11T07:00:00.000Z"), at(1, "2027-01-10T21:30:00.000Z")];
    const groups = dayGroups(rows);
    expect(groups.map((g) => g.day)).toEqual(["2027-01-12", "2027-01-11"]);
    expect(groups[1]?.rows.map((r) => r.chain_pos)).toEqual([2, 1]);
    expect(rows[0]?.chain_pos).toBe(3);
  });
});

describe("dayHeading", () => {
  it("names today and yesterday, then the date", () => {
    expect(dayHeading("2027-01-11", "2027-01-11")).toBe("Bugün");
    expect(dayHeading("2027-01-10", "2027-01-11")).toBe("Dün");
    expect(dayHeading("2027-01-08", "2027-01-11")).toBe("8 Ocak Cuma");
    expect(dayHeading("2027-01-08", null)).toBe("8 Ocak Cuma");
  });
});

describe("inVoice", () => {
  it("drops the name the voice already says, and only that", () => {
    expect(inVoice("KAPtan 3 duyuru okudu.")).toBe("3 duyuru okudu.");
    expect(inVoice("KAPtan Misal Yazılım bildirimini okudu.")).toBe("Misal Yazılım bildirimini okudu.");
    expect(inVoice("KAPtan kurallara baktı.")).toBe("Kurallara baktı.");
    expect(inVoice("KAPtan için hazırlandı.")).toBe("İçin hazırlandı.");
    expect(inVoice("Misal Enerji önerisini onayladın.")).toBe("Misal Enerji önerisini onayladın.");
  });
});

describe("voiceOf", () => {
  it("has two voices only", () => {
    expect(voiceOf("user:sen")).toBe("sen");
    expect(voiceOf("agent:skeptic")).toBe("kaptan");
    expect(voiceOf("system:kap_poller")).toBe("kaptan");
  });
});
