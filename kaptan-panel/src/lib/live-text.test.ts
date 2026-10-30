import type { AuditEntry } from "@/lib/domain";
import { auditSentence, vetoReason } from "./audit-words";
import { repairDeep, repairMojibake } from "./api/http/mojibake";
import { fateOf, flowFromList } from "@/components/disclosures/disclosure-logic";

const veto = (reasons: unknown[]): AuditEntry =>
  ({
    seq: 1,
    chain_pos: 1,
    occurred_at: "2026-10-30T10:00:00Z",
    actor: "agent:pre_gate",
    action: "risk.rejected",
    entity_type: "disclosure",
    entity_id: "1",
    run_id: null,
    strategy_version: null,
    payload: { company: "MOGAN ENERJİ YATIRIM HOLDİNG A.Ş.", reasons },
    prev_hash: "00",
    hash: "a".repeat(64),
  }) as AuditEntry;

describe("pre-gate veto wording", () => {
  it("says the stock is outside the universe for R03, not that it is restricted", () => {
    expect(auditSentence(veto(["R03_UNIVERSE: hisse evren dışında — sert veto", "LLM çağrısı yapılmadı"]))).toBe(
      "Kurallar Mogan Enerji Yatırım Holding için öneriyi baştan reddetti (hisse izlenen evrenin dışında).",
    );
  });

  it("keeps 'tedbirli hisse' for R04 and names the insider list for R13", () => {
    expect(vetoReason(veto(["R04_RESTRICTED: tedbir"]))).toBe("tedbirli hisse");
    expect(vetoReason(veto(["R13_INSIDER_BLOCKLIST: engel"]))).toBe("ekip engel listesinde");
  });

  it("says nothing extra when no rule code is given", () => {
    expect(auditSentence(veto(["bilinmeyen"]))).toBe("Kurallar Mogan Enerji Yatırım Holding için öneriyi baştan reddetti.");
    expect(vetoReason({ payload: {} })).toBeNull();
  });
});

describe("double-decoded KAP text", () => {
  it("turns cp1254 mojibake back into Turkish", () => {
    expect(repairMojibake("TUKAÅ\udc9e GIDA SANAYÄ° VE TÄ°CARET A.Å\udc9e.")).toBe("TUKAŞ GIDA SANAYİ VE TİCARET A.Ş.");
    expect(repairMojibake("evren dÄ±ÅŸÄ±nda â€” sert veto")).toBe("evren dışında — sert veto");
  });

  it("leaves correct text, ASCII and Latin-1 alone", () => {
    for (const ok of ["TUKAŞ GIDA", "Sorumluluk Beyanı", "THYAO", "Ägäis", "Âdem"]) expect(repairMojibake(ok)).toBe(ok);
  });

  it("repairs every string in a JSON value without touching the input", () => {
    const input = { a: ["DÃœNYA"], n: 1, b: null };
    expect(repairDeep(input)).toEqual({ a: ["DÜNYA"], n: 1, b: null });
    expect(input.a[0]).toBe("DÃœNYA");
  });
});

describe("what happened to a disclosure", () => {
  it("counts noise, archive and the crew like the day counters", () => {
    const rows = [
      { is_noise: true, run_id: null, classification: null },
      { is_noise: false, run_id: "r1", classification: { event_type: "E2", confidence: 1, method: "llm" } },
      { is_noise: false, run_id: null, classification: { event_type: "IGNORE", confidence: 1, method: "subject_map" } },
    ] as unknown as Parameters<typeof flowFromList>[0];
    expect(rows.map(fateOf)).toEqual(["noise", "processed", "archived"]);
    expect(flowFromList(rows)).toEqual({ total: 3, noise: 1, archived: 1, processed: 1, e_candidates: 1, capped: false });
  });
});
