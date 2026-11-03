import type { ApprovalCard, Explain } from "@/lib/domain";
import { buildExplain } from "@/mocks/explain-builder";
import { DEMO_E3_SPEC } from "@/mocks/runs-demo";
import { DAY_SPECS } from "@/mocks/runs-day";
import { NBSP } from "@/lib/format";
import {
  answerByLine,
  counterNote,
  crewLead,
  crewLines,
  disclosureQuote,
  lookHere,
  materialityLine,
  middleCaseWords,
  NO_PROMISE,
  pastWins,
  plainEvent,
  plainHistory,
  plainWhy,
  realDisclosureUrl,
  reasonSentence,
  riskSentence,
  riskView,
  sampleWords,
  shortName,
  shrinkSentence,
} from "./plain";
import { ablative, dative, lastNumber, lastSpokenWord, locative, possessive, possessiveLocative } from "./turkish";

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
    expect(ablative("14:16")).toBe("14:16’dan");
    expect(ablative("13:40")).toBe("13:40’tan");
    expect(ablative("09:50")).toBe("09:50’den");
  });
});

describe("what happened, in one sentence", () => {
  it("speaks each event type plainly", () => {
    expect(plainEvent(e3.card)).toBe("Yıllık gelirinin %18’i kadar yeni iş aldı.");
    expect(plainEvent(e1.card)).toBe("Son 10 borsa gününde sermayesinin %0,31’i kadar kendi hissesini geri aldı.");
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

const words = (text: string) => text.replaceAll(NBSP, " ");

describe("the big sentence of the Neden? page", () => {
  it("reads on from the verb, whoever the subject is", () => {
    expect(reasonSentence(e1.card)).toBe("Koru Çelik hissesi, çünkü şirket son 10 borsa gününde sermayesinin %0,31’i kadar kendi hissesini geri aldı.");
    expect(reasonSentence(e2.card)).toBe("Misal Çimento hissesi, çünkü şirketin bir yöneticisi borsadan kendi parasıyla hisse aldı.");
    expect(reasonSentence(e4.card)).toBe("Toros Perakende hissesi, çünkü şirketin kârı beklentinin belirgin biçimde üstünde geldi.");
    expect(reasonSentence({ ...e4.card, side: "sell", headline_tr: "Tutma süresi doldu." })).toBe("Toros Perakende hissesi, çünkü tutma süresi doldu.");
  });
});

describe("why and history", () => {
  it("says what the rule looks for and what was seen", () => {
    expect(plainWhy(e3.card)).toMatch(/^Gelirine göre büyük.*Büyüklükte KAPtan en az %10 yıllık gelir arıyor; bu olayda %18\.$/);
    expect(plainWhy({ ...e3.card, rule_trace_summary: [] })).not.toContain("arıyor");
    // A figure with no unit means nothing to anyone.
    const bare = { rule: "E3.size", passed: true, detail_tr: "", observed: "1,4", threshold: "≥ 1,0" };
    expect(plainWhy({ ...e3.card, rule_trace_summary: [bare] })).toMatch(/Bu olay, KAPtan’ın aradığı ölçüyü geçiyor\.$/);
    expect(plainWhy({ ...e3.card, rule_trace_summary: [bare] })).not.toContain("1,4");
    expect(plainWhy({ ...e3.card, event_type: "EXIT", rule_trace_summary: [] })).toBe("Bu olay türü kurallarımızdan birine uyuyor.");
  });
  it("tells the history against the market, read off the events", () => {
    expect(plainHistory(e3.card.evidence_summary)).toBe("Benzer 23 olayın 14’ünde hisse 5 gün içinde piyasadan iyi gitti.");
    expect(plainHistory(e4.card.evidence_summary, e4.explain.evidence_events)).toBe("Benzer 12 olayın 7’sinde hisse 5 gün içinde piyasadan iyi gitti.");
    const sixUp = Array.from({ length: 12 }, (_, i) => ({ car_5d: i < 6 ? 0.01 : -0.01 }));
    expect(plainHistory(e4.card.evidence_summary, sixUp)).toBe("Benzer 12 olayın 6’sında hisse 5 gün içinde piyasadan iyi gitti.");
    expect(pastWins(e4.card.evidence_summary, sixUp)).toBe(6);
    expect(plainHistory({ ...e4.card.evidence_summary, hit_rate_5d: 0 })).toBe("Benzer 12 olayın hiçbirinde hisse 5 gün içinde piyasadan iyi gitmedi.");
    expect(plainHistory({ ...e3.card.evidence_summary, n: 0 })).toBe("Geçmişte buna benzer olay bulunamadı.");
  });
  it("says how far a sample can be trusted, in words", () => {
    expect(sampleWords(0)).toMatch(/^Geçmişte benzer olay yok/);
    expect(sampleWords(3)).toBe("Yalnızca 3 benzer olay var. Bu çok az; fazla güvenme.");
    expect(sampleWords(6)).toBe("6 benzer olay var. Bu az; temkinli oku.");
    expect(sampleWords(12)).toBe("12 benzer olay var. Bu orta bir sayı; kesin bir şey söylemez.");
    expect(sampleWords(64)).toBe("64 benzer olay var. Bu iyi bir sayı, yine de kesin bir şey söylemez.");
  });
  it("says the middle case both ways, and never promises", () => {
    expect(middleCaseWords(0.012)).toBe("Ortadaki olayda hisse 5 günde piyasadan %1,2 iyi gitti.");
    expect(middleCaseWords(-0.004)).toBe("Ortadaki olayda hisse 5 günde piyasadan %0,4 kötü gitti.");
    expect(middleCaseWords(0)).toBe("Ortadaki olayda hisse 5 günde piyasayla aynı gitti.");
    expect(NO_PROMISE).toContain("sıfır da olabilir");
  });
  it("says until when a suggestion can be answered", () => {
    const exp = "2027-01-12T06:50:00.000Z";
    expect(answerByLine(exp, Date.parse(exp) - 20.5 * 3_600_000)).toBe("Yarın 09:50’ye kadar cevap ver.");
    expect(answerByLine(exp, Date.parse(exp) - 3_600_000)).toBe("Bugün 09:50’ye kadar cevap ver.");
    expect(answerByLine(exp, null)).toBe("09:50’ye kadar cevap ver.");
    expect(answerByLine(exp, Date.parse(exp))).toBe("Cevap süresi doldu.");
    expect(answerByLine(null, 1)).toBeNull();
  });
  it("sizes the risk at the stop and says the loss can be bigger", () => {
    const r = riskView({ qty: 100, limit_price: 50 }, 45);
    expect(r).toMatchObject({ stopPrice: 45, maxLoss: 500 });
    expect(r?.stopPct).toBeCloseTo(-0.1);
    const tmspz = riskView(e4.card, e4.explain.proposal?.stop_price);
    if (!tmspz) throw new Error("no stop");
    expect(words(riskSentence(tmspz, null))).toBe("Fiyat 70,06 ₺’ya düşerse satman gerekir; o noktada kaybın yaklaşık 4.262 ₺ olur. Fiyat bir anda sert düşerse kayıp bundan büyük olabilir.");
    expect(words(riskSentence(tmspz, { pct: 0.005, equity: 1_018_600 }))).toMatch(/kayıp sınırının \(yaklaşık 5.093 ₺\) altında\.$/);
    expect(riskSentence(tmspz, { pct: 0.004, equity: 1_000_000 })).toMatch(/\) üstünde\.$/);
    expect(riskView({ qty: 100, limit_price: 50 }, null)).toBeNull();
    expect(riskView({ qty: 100, limit_price: 50 }, 55)).toBeNull();
  });
  it("drops the legal suffix from company names", () => {
    expect(shortName("MİSAL ENERJİ A.Ş.")).toBe("MİSAL ENERJİ");
    expect(shortName("KURGU")).toBe("KURGU");
  });
});

describe("the link to the real disclosure", () => {
  const card = { disclosure_url: "https://www.kap.org.tr/tr/Bildirim/1640205", is_fixture: false };
  it("is there for a real KAP record", () => {
    expect(realDisclosureUrl(card)).toBe(card.disclosure_url);
  });
  it("is not there for a fixture or anything that is not KAP", () => {
    expect(realDisclosureUrl({ ...card, is_fixture: true })).toBeNull();
    expect(realDisclosureUrl({ ...card, disclosure_url: "https://kap.org.tr.evil.example/x" })).toBeNull();
    expect(realDisclosureUrl({ ...card, disclosure_url: "http://www.kap.org.tr/x" })).toBeNull();
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

describe("the eight steps, one question and one line each", () => {
  it("gives all eight a plain question and a line, in pipeline order", () => {
    const lines = crewLines(e3.card, e3.explain);
    expect(lines.map((l) => l.agent)).toEqual(["classifier", "reader", "materiality", "evidence", "skeptic", "compliance", "rule_engine", "risk_gate"]);
    expect(lines.every((l) => l.question.endsWith("?"))).toBe(true);
    const text = Object.fromEntries(lines.map((l) => [l.agent, l.text]));
    expect(text.classifier).toBe("Bunu “bağlayıcı hizmet sözleşmesi” olarak tanıdı (%93 emin).");
    expect(words(text.reader ?? "")).toContain("432.000.000 ₺");
    expect(text.materiality).toBe("Tutarı şirketin yıllık geliriyle tarttı: gelirin %18’i.");
    expect(text.evidence).toBe("Geçmişte 23 benzer olay buldu, sonuçlarına bakmadan seçti.");
    expect(text.skeptic).toMatch(/fiyatlanmış olabilir\. Tutarı yarıya indirdi\.$/);
    expect(text.compliance).toBe("Bu hisseye konmuş bir borsa yasağı yok; metinde KAPtan'ı yanıltmaya çalışan bir şey de yok.");
    expect(text.rule_engine).toMatch(/kural geçti; yeni iş şartı sağlandı\.$/);
    expect(text.risk_gate).toMatch(/para sınırı kontrolü geçti\. Tutarı .* ile sınırladı\.$/);
    expect(lines.filter((l) => l.changed).map((l) => l.agent)).toEqual(["skeptic", "risk_gate"]);
  });
  it("leads with what changed the amount, in plain words", () => {
    const lines = crewLines(e4.card, e4.explain);
    expect(words(crewLead(lines, e4.card))).toBe("KAPtan 8 adımda inceledi; 2’si tutarı değiştirdi: karşı görüş dörtte bir azalttı, para sınırları 43.495 ₺ ile sınırladı.");
    const calm = { ...e1.card, final_notional_try: e1.card.requested_notional_try };
    expect(crewLead(crewLines(calm, null), calm)).toBe("KAPtan 8 adımda inceledi; tutar değişmedi.");
  });
  it("never says an internal step name", () => {
    const all = [e1, e2, e3, e4].flatMap((f) => crewLines(f.card, f.explain).flatMap((l) => [l.question, l.text])).join(" ");
    expect(all).not.toMatch(/Şüpheci|Uyum|Risk Kapısı|Tedbir|injection/);
    expect(counterNote({ skeptic_note_tr: "Şüpheci ek bir risk bulmadı." })).toBe("Karşı görüş ek bir risk bulmadı.");
    expect(shrinkSentence(0.5)).toBe("KAPtan bu yüzden tutarı yarıya indirdi.");
    expect(shrinkSentence(1)).toBeNull();
  });
  it("names the point it wants a person to look at", () => {
    expect(lookHere(e4.card, e4.explain)).toBe("KAPtan’ın senin bakmanı istediği nokta: kârın bir kısmı tek seferlik arsa satışından geliyor; yönetimin “kalıcı iyileşme” dili buna tam uymuyor.");
    expect(lookHere(e1.card, e1.explain)).toBeNull();
    const text = Object.fromEntries(crewLines(e4.card, e4.explain).map((l) => [l.agent, l.text]));
    expect(text.rule_engine).toBe("6/6 kural geçti; kâr sürprizi şartı sağlandı.");
  });
  it("still speaks before the run details arrive", () => {
    const text = Object.fromEntries(crewLines(e4.card, null).map((l) => [l.agent, l.text]));
    expect(text.classifier).toBe("Bunu “finansal sonuç” olarak tanıdı.");
    expect(text.reader).toBe("Metindeki rakamları ve tarafları çıkardı.");
    expect(text.compliance).toBe("Bu hisseye konmuş bir borsa yasağı yok. KAPtan bir noktayı senin bakman için işaretledi.");
    expect(text.risk_gate).not.toContain("para sınırı kontrolü");
    const unshrunk = crewLines({ ...e1.card, final_notional_try: e1.card.requested_notional_try }, null);
    expect(unshrunk.at(-1)?.text).toMatch(/^Tutar: /);
  });
  it("weighs size in each event's own terms", () => {
    expect(materialityLine("E1", "%0,31")).toBe("Geri alınan payı sermayeyle tarttı: sermayenin %0,31’i.");
    expect(materialityLine("E4", "1,4")).toBe("Kârı beklentiyle kıyasladı: sürpriz ölçüsü 1,4.");
    expect(materialityLine("E2", "borsada alım")).toBe("Olayı şirketin büyüklüğüyle karşılaştırdı.");
  });
});
