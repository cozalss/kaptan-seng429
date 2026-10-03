import type { ApprovalCard, Explain } from "@/lib/domain";
import { buildExplain } from "@/mocks/explain-builder";
import { DEMO_E3_SPEC } from "@/mocks/runs-demo";
import { DAY_SPECS } from "@/mocks/runs-day";
import {
  crewDayLine,
  crewLines,
  deadlineLine,
  holdLine,
  materialityLine,
  plainEvent,
  plainHistory,
  plainWhy,
  riskView,
  shortName,
  suggestionLine,
  todayHeadline,
} from "./plain";
import { dative, lastNumber, lastSpokenWord, locative, possessive, possessiveLocative } from "./turkish";

function fixture(runId: string): { card: ApprovalCard; explain: Explain } {
  const spec = runId === DEMO_E3_SPEC.run_id ? DEMO_E3_SPEC : DAY_SPECS.find((s) => s.run_id === runId);
  if (!spec) throw new Error(runId);
  const explain = buildExplain(spec);
  if (!explain.approval) throw new Error("no card");
  return { card: explain.approval, explain };
}

const e3 = fixture(DEMO_E3_SPEC.run_id);
const e1 = fixture("run-day-e1-krgcl");
const e2 = fixture("run-day-e2-orncm");
const e4 = fixture("run-day-e4-tmspz");

describe("Turkish number suffixes", () => {
  it("reads the last spoken word of a number", () => {
    expect([0, 1, 18, 20, 60, 100, 1000, 2_000_000].map(lastSpokenWord)).toEqual(["sıfır", "bir", "sekiz", "yirmi", "altmış", "yüz", "bin", "milyon"]);
    expect(lastNumber("%0,31")).toBe(31);
    expect(lastNumber("%0,30")).toBe(3);
    expect(lastNumber("%60")).toBe(60);
    expect(lastNumber("09:50")).toBe(50);
    expect(lastNumber("yok")).toBe(0);
  });
  it("follows vowel harmony and the buffer consonants", () => {
    expect(possessive("%18")).toBe("%18’i");
    expect(possessive("%20")).toBe("%20’si");
    expect(possessive("%10")).toBe("%10’u");
    expect(possessive("%4")).toBe("%4’ü");
    expect(possessiveLocative("%61")).toBe("%61’inde");
    expect(possessiveLocative("%60")).toBe("%60’ında");
    expect(possessiveLocative("%57")).toBe("%57’sinde");
    expect(dative("09:50")).toBe("09:50’ye");
    expect(dative("09:40")).toBe("09:40’a");
    expect(locative("13:41")).toBe("13:41’de");
    expect(locative("13:40")).toBe("13:40’ta");
    expect(locative("09:30")).toBe("09:30’da");
  });
});

describe("what happened, in one sentence", () => {
  it("speaks each event type plainly", () => {
    expect(plainEvent(e3.card)).toBe("Yıllık gelirinin %18’i kadar yeni iş aldı.");
    expect(plainEvent(e1.card)).toBe("Son 10 seansta sermayesinin %0,31’i kadar kendi hissesini geri aldı.");
    expect(plainEvent(e2.card)).toBe("Bir yöneticisi borsadan kendi parasıyla hisse aldı.");
    expect(plainEvent({ ...e2.card, sub_type_tr: "Ana ortak alımı" })).toBe("Ana ortağı borsadan kendi hissesini aldı.");
    expect(plainEvent(e4.card)).toBe("Kârı beklentinin belirgin biçimde üstünde geldi.");
  });
  it("falls back when the rule has no percentage, or to the headline", () => {
    expect(plainEvent({ ...e3.card, rule_trace_summary: [] })).toBe("Büyük ve bağlayıcı yeni bir iş aldı.");
    expect(plainEvent({ ...e1.card, rule_trace_summary: [] })).toBe("Kendi hissesini borsadan geri aldı.");
    expect(plainEvent({ ...e3.card, event_type: "EXIT" })).toBe(e3.card.headline_tr);
  });
});

describe("why, history and the suggestion", () => {
  it("names the rule's threshold and what was seen", () => {
    expect(plainWhy(e3.card)).toMatch(/^Gelirine göre büyük.*Büyüklük için eşiği ≥ %10 yıllık gelir; bu olayda %18\.$/);
    expect(plainWhy(e4.card)).toContain("Kâr sürprizi için eşiği ≥ 1,0; bu olayda 1,4.");
    expect(plainWhy({ ...e3.card, rule_trace_summary: [] })).not.toContain("eşiği");
    expect(plainWhy({ ...e3.card, event_type: "EXIT", rule_trace_summary: [] })).toBe("Bu olay türü kurallarımızdan birine uyuyor.");
  });
  it("tells the history as a share of similar events", () => {
    expect(plainHistory(e3.card.evidence_summary)).toBe("Benzer 23 olayın %61’inde hisse 5 gün içinde yükseldi (ortanca +%1,1).");
    expect(plainHistory({ ...e3.card.evidence_summary, n: 0 })).toBe("Geçmişte buna benzer olay bulunamadı.");
  });
  it("prints lots, limit and holding period", () => {
    expect(suggestionLine({ qty: 1240, limit_price: 48.4 })).toBe("1.240 lot · en fazla 48,40 TL");
    expect(holdLine(e3.card)).toBe("5 gün tut");
    expect(holdLine(e1.card)).toBe("20–40 gün tut");
  });
  it("counts down to the 09:50 deadline", () => {
    const exp = "2027-01-12T06:50:00.000Z";
    expect(deadlineLine(exp, null)).toBe("Karar için son saat 09:50.");
    expect(deadlineLine(exp, Date.parse(exp) - 20.5 * 3_600_000)).toBe("Karar için 09:50’ye 20 sa var.");
    expect(deadlineLine(exp, Date.parse(exp) - 90_000)).toBe("Karar için 09:50’ye 2 dk var.");
    expect(deadlineLine(exp, Date.parse(exp))).toBe("Karar süresi 09:50’de doldu.");
  });
  it("sizes the risk at the stop", () => {
    const r = riskView({ qty: 100, limit_price: 50 }, 45);
    expect(r).toMatchObject({ stopPrice: 45, maxLoss: 500 });
    expect(r?.stopPct).toBeCloseTo(-0.1);
    expect(riskView({ qty: 100, limit_price: 50 }, null)).toBeNull();
    expect(riskView({ qty: 100, limit_price: 50 }, 55)).toBeNull();
  });
});

describe("today", () => {
  it("has one big sentence for each state", () => {
    expect(todayHeadline(2, false)).toBe("Bugün 2 öneri var.");
    expect(todayHeadline(0, false)).toBe("Bugün öneri yok — tayfa izliyor.");
    expect(todayHeadline(3, true)).toBe("Durdurdun — yeni öneri gelmez.");
  });
  it("tells what the crew did", () => {
    expect(crewDayLine(null)).toBeNull();
    expect(crewDayLine({ total: 0, processed: 0, proposals: 0 })).toBe("Tayfa bugün henüz bildirim okumadı.");
    expect(crewDayLine({ total: 212, processed: 13, proposals: 5 })).toBe("Tayfa bugün 212 bildirim okudu, 13 tanesini inceledi, 5 öneri çıkardı.");
  });
  it("drops the legal suffix from company names", () => {
    expect(shortName("ÖRNEK ENERJİ A.Ş.")).toBe("ÖRNEK ENERJİ");
    expect(shortName("KURGU")).toBe("KURGU");
  });
});

describe("the crew, one line each", () => {
  it("gives all eight members a line, in pipeline order", () => {
    const lines = crewLines(e3.card, e3.explain);
    expect(lines.map((l) => l.agent)).toEqual(["classifier", "reader", "materiality", "evidence", "skeptic", "compliance", "rule_engine", "risk_gate"]);
    const text = Object.fromEntries(lines.map((l) => [l.agent, l.text]));
    expect(text.classifier).toBe("Bunu “bağlayıcı hizmet sözleşmesi” olarak tanıdı (%93 emin).");
    expect(text.reader).toContain("432.000.000 TL");
    expect(text.materiality).toBe("Tutarı şirketin yıllık geliriyle tarttı: gelirin %18’i.");
    expect(text.evidence).toBe("Geçmişte 23 benzer olay buldu, sonuçlarına bakmadan seçti.");
    expect(text.skeptic).toMatch(/fiyatlanmış olabilir\. Tutarı yarıya indirdi\.$/);
    expect(text.compliance).toBe("Tedbir yok, metinde gizli talimat yok.");
    expect(text.rule_engine).toMatch(/kural geçti; E3 şartı sağlandı\.$/);
    expect(text.risk_gate).toMatch(/risk kontrolü geçti\. Tutarı .* ile sınırladı\.$/);
  });
  it("still speaks before the run details arrive", () => {
    const text = Object.fromEntries(crewLines(e4.card, null).map((l) => [l.agent, l.text]));
    expect(text.classifier).toBe("Bunu “finansal sonuç” olarak tanıdı.");
    expect(text.reader).toBe("Metindeki rakamları ve tarafları çıkardı.");
    expect(text.compliance).toBe("Tedbir yok; bir noktayı senin bakman için işaretledi.");
    expect(text.risk_gate).not.toContain("risk kontrolü");
    const unshrunk = crewLines({ ...e1.card, final_notional_try: e1.card.requested_notional_try }, null);
    expect(unshrunk.at(-1)?.text).toMatch(/^Tutar: /);
  });
  it("weighs materiality in each event's own terms", () => {
    expect(materialityLine("E1", "%0,31")).toBe("Geri alınan payı sermayeyle tarttı: sermayenin %0,31’i.");
    expect(materialityLine("E4", "1,4")).toBe("Kârı beklentiyle kıyasladı: sürpriz ölçüsü 1,4.");
    expect(materialityLine("E2", "borsada alım")).toBe("Olayı şirketin büyüklüğüyle karşılaştırdı.");
  });
});
