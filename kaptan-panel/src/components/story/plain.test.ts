import type { ApprovalCard, Explain } from "@/lib/domain";
import { buildExplain } from "@/mocks/explain-builder";
import { DEMO_E3_SPEC } from "@/mocks/runs-demo";
import { DAY_SPECS } from "@/mocks/runs-day";
import {
  cardFooterLine,
  crewDayLine,
  crewLead,
  crewLines,
  decisionMetaLine,
  disclosureQuote,
  holdLine,
  materialityLine,
  plainEvent,
  plainHistory,
  plainWhy,
  proposalLine,
  riskSentence,
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
  it("tells the history as a count of similar events, read off the events", () => {
    expect(plainHistory(e3.card.evidence_summary)).toBe("Benzer 23 olayın 14’ünde hisse 5 gün içinde yükseldi.");
    expect(plainHistory(e4.card.evidence_summary, e4.explain.evidence_events)).toBe("Benzer 12 olayın 7’sinde hisse 5 gün içinde yükseldi.");
    const sixUp = Array.from({ length: 12 }, (_, i) => ({ car_5d: i < 6 ? 0.01 : -0.01 }));
    expect(plainHistory(e4.card.evidence_summary, sixUp)).toBe("Benzer 12 olayın 6’sında hisse 5 gün içinde yükseldi.");
    expect(plainHistory({ ...e4.card.evidence_summary, hit_rate_5d: 0 })).toBe("Benzer 12 olayın hiçbirinde hisse 5 gün içinde yükselmedi.");
    expect(plainHistory({ ...e3.card.evidence_summary, n: 0 })).toBe("Geçmişte buna benzer olay bulunamadı.");
  });
  it("prints lots, limit and holding period", () => {
    expect(suggestionLine({ qty: 1240, limit_price: 48.4 })).toBe("1.240 lot al · tanesi en fazla 48,40\u00a0TL");
    expect(holdLine(e3.card)).toBe("5 gün tut");
    expect(holdLine(e1.card)).toBe("20–40 gün tut");
    expect(proposalLine(e4.card)).toBe("Öneri: 560 lot al, tanesi en fazla 77,67\u00a0TL — toplam ≈ 43.495\u00a0TL. 5–10 gün tut.");
  });
  it("says until when a card can be signed, and how much of the portfolio it is", () => {
    const exp = "2027-01-12T06:50:00.000Z";
    const card = { qty: 560, limit_price: 77.67, expires_at: exp, final_notional_try: 43_495 };
    const dayBefore = Date.parse(exp) - 20.5 * 3_600_000;
    expect(cardFooterLine(card, new Date(dayBefore).toISOString())).toBe("560 lot al · tanesi en fazla 77,67\u00a0TL · yarın 09:50’ye kadar");
    expect(cardFooterLine(card, null)).toBe("560 lot al · tanesi en fazla 77,67\u00a0TL · 09:50’ye kadar");
    expect(decisionMetaLine(card, 1_016_480, dayBefore)).toBe("Portföyün %4,3’ü · karar için son saat yarın 09:50 (20 saat 30 dakika kaldı)");
    expect(decisionMetaLine(card, null, null)).toBe("Karar için son saat 09:50");
    expect(decisionMetaLine(card, null, Date.parse(exp))).toBe("Karar süresi 09:50’de doldu");
  });
  it("sizes the risk at the stop", () => {
    const r = riskView({ qty: 100, limit_price: 50 }, 45);
    expect(r).toMatchObject({ stopPrice: 45, maxLoss: 500 });
    expect(r?.stopPct).toBeCloseTo(-0.1);
    const tmspz = riskView(e4.card, e4.explain.proposal?.stop_price);
    if (!tmspz) throw new Error("no stop");
    expect(riskSentence(tmspz, null)).toBe("Fiyat 70,06\u00a0TL’ye düşerse satman gerekir; o noktada kaybın en fazla ≈ 4.262\u00a0TL olur.");
    expect(riskSentence(tmspz, { pct: 0.005, equity: 1_018_600 })).toMatch(/Bu, işlem başına sınırın \(sermayenin %0,5’i ≈ 5.093\u00a0TL\) altında\.$/);
    expect(riskSentence(tmspz, { pct: 0.004, equity: 1_000_000 })).toMatch(/\) üstünde\.$/);
    expect(riskView({ qty: 100, limit_price: 50 }, null)).toBeNull();
    expect(riskView({ qty: 100, limit_price: 50 }, 55)).toBeNull();
  });
});

describe("today", () => {
  it("has one big sentence for each state", () => {
    expect(todayHeadline(2, false)).toBe("Bugün 2 öneri var.");
    expect(todayHeadline(0, false)).toBe("Bugün öneri yok — tayfa izliyor.");
    expect(todayHeadline(3, true)).toBe("Her şey durduruldu — yeni öneri gelmez.");
  });
  it("tells what the crew did", () => {
    expect(crewDayLine(null)).toBeNull();
    const zero = { total: 0, processed: 0, proposals: 0, approvals: 0, rejections: 0 };
    expect(crewDayLine(zero)).toBe("Tayfa bugün henüz bildirim okumadı.");
    expect(crewDayLine({ total: 212, processed: 13, proposals: 5, approvals: 1, rejections: 1 })).toBe(
      "Tayfa bugün 212 bildirim okudu; 199’unu kurallar hemen eledi, 13’ünü inceledi ve 5 öneri çıkardı: 3’ü seni bekliyor, 1’i imzalandı, 1’i reddedildi.",
    );
    expect(crewDayLine({ ...zero, total: 40, processed: 2 })).toBe("Tayfa bugün 40 bildirim okudu; 38’ini kurallar hemen eledi ve 2’sini inceledi.");
    expect(crewDayLine({ ...zero, total: 20, processed: 20, proposals: 2 })).toBe("Tayfa bugün 20 bildirim okudu; 20’sini inceledi ve 2 öneri çıkardı: 2’si seni bekliyor.");
  });
  it("drops the legal suffix from company names", () => {
    expect(shortName("ÖRNEK ENERJİ A.Ş.")).toBe("ÖRNEK ENERJİ");
    expect(shortName("KURGU")).toBe("KURGU");
  });
});

describe("the disclosure quote", () => {
  it("picks the first sentence with a figure, else paragraph 2, else nothing", () => {
    expect(disclosureQuote("BAŞLIK\n\nGenel bir giriş cümlesi. Tutar 3.720.000 TL oldu.\n\nSon.")).toBe("Tutar 3.720.000 TL oldu.");
    expect(disclosureQuote("BAŞLIK\n\nRakamsız bir cümle. İkinci cümle.")).toBe("Rakamsız bir cümle.");
    expect(disclosureQuote("Yalnızca başlık")).toBeNull();
    expect(disclosureQuote(undefined)).toBeNull();
  });
});

describe("the crew, one line each", () => {
  it("gives all eight members a line, in pipeline order", () => {
    const lines = crewLines(e3.card, e3.explain);
    expect(lines.map((l) => l.agent)).toEqual(["classifier", "reader", "materiality", "evidence", "skeptic", "compliance", "rule_engine", "risk_gate"]);
    const text = Object.fromEntries(lines.map((l) => [l.agent, l.text]));
    expect(text.classifier).toBe("Bunu “bağlayıcı hizmet sözleşmesi” olarak tanıdı (%93 emin).");
    expect(text.reader).toContain("432.000.000\u00a0TL");
    expect(text.materiality).toBe("Tutarı şirketin yıllık geliriyle tarttı: gelirin %18’i.");
    expect(text.evidence).toBe("Geçmişte 23 benzer olay buldu, sonuçlarına bakmadan seçti.");
    expect(text.skeptic).toMatch(/fiyatlanmış olabilir\. Tutarı yarıya indirdi\.$/);
    expect(text.compliance).toBe("Tedbir yok, metinde gizli talimat yok.");
    expect(text.rule_engine).toMatch(/kural geçti; yeni iş şartı sağlandı\.$/);
    expect(text.risk_gate).toMatch(/risk kontrolü geçti\. Tutarı .* ile sınırladı\.$/);
    expect(lines.filter((l) => l.changed).map((l) => l.agent)).toEqual(["skeptic", "risk_gate"]);
  });
  it("leads with who changed the amount", () => {
    const lines = crewLines(e4.card, e4.explain);
    expect(crewLead(lines, e4.card)).toBe("8 üye çalıştı; 2’si tutarı değiştirdi: Şüpheci dörtte bir azalttı, Risk Kapısı 43.495\u00a0TL ile sınırladı.");
    const calm = { ...e1.card, final_notional_try: e1.card.requested_notional_try };
    expect(crewLead(crewLines(calm, null), calm)).toBe("8 üye çalıştı; hiçbiri tutarı değiştirmedi.");
  });
  it("names the point Uyum wants a person to look at", () => {
    const text = Object.fromEntries(crewLines(e4.card, e4.explain).map((l) => [l.agent, l.text]));
    expect(text.compliance).toBe("Tedbir yok. Senin bakmanı istediği nokta: kârın bir kısmı tek seferlik arsa satışından geliyor; yönetimin “kalıcı iyileşme” dili buna tam uymuyor.");
    expect(text.rule_engine).toBe("6/6 kural geçti; kâr sürprizi şartı sağlandı.");
  });
  it("still speaks before the run details arrive", () => {
    const text = Object.fromEntries(crewLines(e4.card, null).map((l) => [l.agent, l.text]));
    expect(text.classifier).toBe("Bunu “finansal sonuç” olarak tanıdı.");
    expect(text.reader).toBe("Metindeki rakamları ve tarafları çıkardı.");
    expect(text.compliance).toBe("Tedbir yok; bir noktayı insan incelemesi için işaretledi.");
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
