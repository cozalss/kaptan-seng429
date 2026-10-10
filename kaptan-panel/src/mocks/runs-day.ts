import { istanbulIso } from "@/lib/time";
import { DEMO_DAY } from "./clock";
import { DAY_INDEX_BASE } from "./ids";
import { slotTime } from "./day-times";
import { issuer } from "./issuers";
import { commonTrace, e1Reader, e2Reader, e3Reader, e4Reader, trace } from "./readers";
import type { RunSpec } from "./run-spec";

/**
 * The 13 disclosures the pipeline took up on the demo day before 13:40, plus the
 * historical runs behind today's open positions. All issuers are fictional (Temsili).
 */
type Partial2 = Omit<RunSpec, "disclosure_index" | "publishedAtIso" | "headline_tr" | "text_tr" | "text_en" | "strategy_version" | "is_fixture" | "status" | "outcome"> &
  Partial<Pick<RunSpec, "status" | "outcome" | "strategy_version">> & { slot: number; headline: string; body: string; publishedAtIso?: string };

function text(ticker: string, subject: string, body: string): string {
  return `${issuer(ticker).name} — ${subject}\n\n${body}\n\nBu metin KAPtan fikstürüdür; gerçek bir şirkete veya bildirime ait değildir.`;
}

function mk(p: Partial2): RunSpec {
  const outcome =
    p.outcome ??
    (p.kind === "propose" ? "PROPOSE" : p.kind === "hold" ? "HOLD" : p.kind === "pregate_veto" ? "PREGATE_VETO" : "NO_TRADE");
  const status = p.status ?? (p.kind === "propose" && p.decision?.status === "pending" ? "interrupted" : "completed");
  const { slot, headline, body, ...rest } = p;
  return {
    ...rest,
    disclosure_index: DAY_INDEX_BASE + slot,
    publishedAtIso: p.publishedAtIso ?? slotTime(slot),
    headline_tr: headline,
    text_tr: text(p.ticker, p.subject, body),
    text_en: p.route === "noise" ? null : `${issuer(p.ticker).name} — illustrative English version of the disclosure.\n\n(Fixture text; not a real company.)`,
    strategy_version: p.strategy_version ?? "v1.1-fwd",
    is_fixture: false,
    status,
    outcome,
  };
}

const at = (hhmm: string, date = DEMO_DAY) => istanbulIso(date, hhmm);
const NONE = { reasonCodes: [] as string[], ruleTrace: [], evidence: null, skeptic: null, proposal: null, decision: null, compliance: null };

export const DAY_SPECS: readonly RunSpec[] = [
  mk({
    ...NONE,
    slot: 7, run_id: "run-day-e1-krgcl", ticker: "KRGCL", event: "E1", classifiedAs: "E1", classifierConfidence: 0.98, method: "subject_map",
    route: "E1", subject: "Pay Geri Alımına İlişkin Bildirim", kind: "propose",
    headline: "Son 10 seansta sermayenin %0,31'i oranında geri alım", body: "Şirketimiz 06–08.01.2027 tarihlerinde toplam 3.720.000 TL nominal değerli pay geri almıştır. Geri alınan payların sermayeye oranı son 10 seansta %0,31'e ulaşmıştır.",
    sub_type: "buyback_execution", sub_type_tr: "Pay geri alım işlemi",
    reader: e1Reader("toplam 3.720.000 TL nominal değerli pay", 0.0031, 3_720_000),
    merge: { ratio: 0.0031, denominatorName: "paid_in_capital", denominator: 1_200_000_000, amountTry: 3_720_000, amountInText: true },
    leakage5d: 0.019,
    evidence: { n: 64, nSameTicker: 3, mean5: 0.009, median5: 0.007, hit5: 0.58, mean20: 0.018, median20: 0.011, hit20: 0.58, ci20: [0.004, 0.031] },
    skeptic: { multiplier: 1, flags: [], counter_tr: "Program 3. ayında; ana ortak satışı yok; geri alım dalgası alt grubunda izlenmeli." },
    ruleTrace: [
      trace("E1.capital_10d", true, "%0,31", "≥ %0,25", "Son 10 seansta sermayenin %0,31'i geri alındı."),
      trace("E1.execution", true, "gerçekleşen alım", "duyuru değil", "Gerçekleşen alım bildirimi."),
      ...commonTrace("+%1,9", true, "2,8×", true, 64),
    ],
    reasonCodes: ["E1_RULE_MET"], compliance: "pass", guardScore: 0.01,
    proposal: { refPrice: 33.48, qty: 1_480, stopPct: 0.087, holding: [20, 40], edgeBps: 93, costBps: 33, requestedNotional: 50_500, entry: "next_open_auction" },
    decision: { status: "pending" }, llmCalls: 5, tokens: [14_200, 2_050],
  }),
  mk({
    ...NONE,
    slot: 19, run_id: "run-day-e2-orncm", ticker: "ORNCM", event: "E2", classifiedAs: "E2", classifierConfidence: 0.95, method: "subject_map",
    route: "E2", subject: "Pay Alım Satım Bildirimi", kind: "propose",
    headline: "Yönetim kurulu üyesinden borsada 2,4 milyon TL'lik alım", body: "Yönetim kurulu üyemiz KİŞİ_1, 08.01.2027 tarihinde Borsa İstanbul'da 2.400.000 TL tutarında şirket payı satın almıştır.",
    sub_type: "insider_or_major_holder_trade", sub_type_tr: "Yönetici pay alımı",
    reader: e2Reader("2.400.000 TL tutarında şirket payı satın almıştır", 2_400_000),
    merge: { ratio: 0.00018, amountTry: 2_400_000, amountInText: true },
    leakage5d: 0.012,
    evidence: { n: 31, nSameTicker: 2, mean5: 0.011, median5: 0.008, hit5: 0.6, mean20: 0.024, median20: 0.017, hit20: 0.61, ci20: [0.002, 0.045] },
    skeptic: { multiplier: 0.75, flags: [{ code: "WEAK_EVIDENCE", severity: "reduce", detail_tr: "Kümelenme yok: son 30 günde tek alıcı." }], counter_tr: "Tek yöneticinin tek alımı; kümelenme yok. Büyüklük ×0,75." },
    ruleTrace: [
      trace("E2.open_market", true, "borsada alım", "piyasadan", "Alım borsada yapılmış."),
      trace("E2.insider_role", true, "YK üyesi", "yönetici / ana ortak", "Alıcı yönetim kurulu üyesi."),
      ...commonTrace("+%1,2", true, "2,3×", true, 31),
    ],
    reasonCodes: ["E2_RULE_MET"], compliance: "pass", guardScore: 0.01,
    proposal: { refPrice: 112.3, qty: 420, stopPct: 0.09, holding: [20, 60], edgeBps: 82, costBps: 35, requestedNotional: 64_000, entry: "next_open_auction", escalate: ["NEAR_MAX_POSITIONS"] },
    decision: { status: "pending" }, llmCalls: 5, tokens: [13_900, 1_980],
  }),
  mk({
    ...NONE,
    slot: 33, run_id: "run-day-e4-tmspz", ticker: "TMSPZ", event: "E4", classifiedAs: "E4", classifierConfidence: 0.99, method: "subject_map",
    route: "E4", subject: "Finansal Rapor", kind: "propose",
    headline: "2026 yıllık sonuçları: beklenti üstü kâr (SUE 1,4)", body: "Şirketimizin 2026 yılı konsolide finansal tabloları bağımsız denetimden geçmiş olarak yayımlanmıştır. Net dönem kârı bir önceki yıla göre reel olarak artmıştır.",
    sub_type: "financial_results", sub_type_tr: "Finansal sonuç",
    reader: e4Reader("Net dönem kârı bir önceki yıla göre reel olarak artmıştır", "mixed"),
    merge: { ratio: 1.4, amountInText: true },
    leakage5d: 0.034,
    evidence: { n: 12, nSameTicker: 4, mean5: 0.012, median5: 0.009, hit5: 0.58, mean20: 0.015, median20: 0.01, hit20: 0.55, ci20: [-0.011, 0.04] },
    skeptic: { multiplier: 0.75, flags: [{ code: "STALE_OR_WEAK_FINANCIALS", severity: "reduce", detail_tr: "Kârın bir kısmı tek seferlik arsa satışından." }], counter_tr: "Kârın bir bölümü tek seferlik; çekirdek iyileşme daha zayıf." },
    ruleTrace: [
      trace("E4.sue", true, "1,4", "≥ 1,0", "Beklenmeyen kâr standart sapmanın 1,4 katı."),
      trace("E4.cfo_quality", true, "iyi", "nakit akışı destekliyor", "Faaliyet nakit akışı kârı destekliyor."),
      trace("E4.ret10d", true, "+%5,0", "< %12", "Son 10 seansta aşırı yükseliş yok."),
      ...commonTrace("+%3,4", true, "2,2×", true, 12),
    ],
    reasonCodes: ["E4_RULE_MET"], compliance: "escalate", guardScore: 0.04,
    proposal: { refPrice: 76.15, qty: 560, stopPct: 0.08, holding: [5, 10], edgeBps: 75, costBps: 34, requestedNotional: 57_000, entry: "next_open_auction", escalate: ["COMPLIANCE_ESCALATE"] },
    decision: { status: "pending" }, llmCalls: 6, tokens: [17_100, 2_390],
  }),
  mk({
    ...NONE,
    slot: 52, run_id: "run-day-e3-mslel", ticker: "MSLEL", event: "E3", classifiedAs: "E3", classifierConfidence: 0.94, method: "subject_map",
    route: "E3", subject: "Yeni İş İlişkisi", kind: "no_trade",
    headline: "Yurt dışı distribütörle niyet mektubu", body: "Şirketimiz bir yurt dışı distribütörle, tahmini yıllık 140.000.000 TL tutarında olabilecek bir işbirliği için bağlayıcı olmayan niyet mektubu imzalamıştır.",
    sub_type: "mou_or_loi", sub_type_tr: "Niyet mektubu",
    reader: e3Reader({ quote: "bağlayıcı olmayan niyet mektubu", amount: 140_000_000, amountRaw: "140.000.000 TL", months: 12, binding: "mou_or_loi", publicSector: false, subject: "Distribütörlük işbirliği" }),
    merge: { ratio: 0.21, denominatorName: "annual_revenue", denominator: 660_000_000, amountTry: 140_000_000, amountInText: true },
    leakage5d: 0.006,
    skeptic: { multiplier: 0.25, flags: [{ code: "NOT_BINDING", severity: "veto", detail_tr: "Niyet mektubu bağlayıcı değil." }], counter_tr: "Bağlayıcı olmayan niyet mektubu; E3 şartı sağlanmıyor." , veto: true },
    ruleTrace: [
      trace("E3.materiality", true, "%21", "≥ %10 yıllık gelir", "Tutar eşik üstünde."),
      trace("E3.binding", false, "niyet mektubu", "bağlayıcı", "Bağlayıcı değil: işlem yok."),
    ],
    reasonCodes: ["SKEPTIC_VETO", "E3_RULE_NOT_MET"], guardScore: 0.02, llmCalls: 5, tokens: [12_800, 1_700],
  }),
  mk({
    ...NONE,
    slot: 64, run_id: "run-day-e1-dmoen", ticker: "DMOEN", event: "E1", classifiedAs: "E1", classifierConfidence: 0.97, method: "subject_map",
    route: "E1", subject: "Pay Geri Alımına İlişkin Bildirim", kind: "no_trade",
    headline: "Geri alım programı duyurusu (henüz alım yok)", body: "Yönetim kurulumuz 12 ay süreli, en çok 8.000.000 TL nominal değerli pay geri alım programı başlatılmasına karar vermiştir. Bugüne kadar alım yapılmamıştır.",
    sub_type: "buyback_program", sub_type_tr: "Geri alım programı duyurusu",
    reader: e1Reader("en çok 8.000.000 TL nominal değerli pay geri alım programı", 0, 0),
    merge: { ratio: 0, denominatorName: "paid_in_capital", denominator: 900_000_000, amountTry: 0, amountInText: true },
    leakage5d: 0.003,
    ruleTrace: [trace("E1.execution", false, "program duyurusu", "gerçekleşen alım", "Duyuru E1 değildir; yalnızca gerçekleşen alım sayılır.")],
    reasonCodes: ["E1_RULE_NOT_MET"], guardScore: 0.01, llmCalls: 2, tokens: [5_100, 700],
  }),
  mk({
    ...NONE,
    slot: 78, run_id: "run-day-e2-frztl", ticker: "FRZTL", event: "E2", classifiedAs: "E2", classifierConfidence: 0.9, method: "subject_map",
    route: "E2", subject: "Pay Alım Satım Bildirimi", kind: "no_trade",
    headline: "Yatırım fonu %5 eşiğini aştı", body: "Bir yatırım fonu şirketimizdeki payını %4,92'den %5,07'ye çıkardığını bildirmiştir.",
    sub_type: "insider_or_major_holder_trade", sub_type_tr: "Fon eşik bildirimi",
    reader: e2Reader("payını %4,92'den %5,07'ye çıkardığını", 9_400_000, "investment_fund"),
    merge: { ratio: 0.0015, amountTry: 9_400_000, amountInText: true },
    leakage5d: 0.008,
    skeptic: { multiplier: 0.25, flags: [{ code: "FUND_NOT_INSIDER", severity: "veto", detail_tr: "Fon eşik bildirimi yönetici alımı değildir." }], counter_tr: "Alıcı bir yatırım fonu; E2 kapsamı dışında.", veto: true },
    ruleTrace: [trace("E2.insider_role", false, "yatırım fonu", "yönetici / ana ortak", "Fonların eşik bildirimleri E2 değildir.")],
    reasonCodes: ["SKEPTIC_VETO", "E2_RULE_NOT_MET"], guardScore: 0.01, llmCalls: 4, tokens: [10_200, 1_420],
  }),
  mk({
    ...NONE,
    slot: 91, run_id: "run-day-r13-krgtk", ticker: "KRGTK", event: "E3", classifiedAs: "E3", classifierConfidence: 0.96, method: "subject_map",
    route: "E3", subject: "Yeni İş İlişkisi", kind: "pregate_veto",
    headline: "Kamu kurumuyla yazılım sözleşmesi", body: "Şirketimiz bir kamu kurumuyla 24 ay süreli, 96.000.000 TL tutarlı yazılım hizmet sözleşmesi imzalamıştır.",
    sub_type: "contract_signed", sub_type_tr: "Bağlayıcı sözleşme", reader: null, leakage5d: 0, guardScore: 0,
    preGateReasons: ["R13_INSIDER_BLOCKLIST: ekip içeriden-öğrenen engel listesinde (team_insider)", "LLM çağrısı yapılmadı"],
    reasonCodes: ["R13_INSIDER_BLOCKLIST"], llmCalls: 0, tokens: [0, 0],
  }),
  mk({
    ...NONE,
    slot: 104, run_id: "run-day-hold-ornyz", ticker: "ORNYZ", event: "E3", classifiedAs: "E3", classifierConfidence: 0.71, method: "llm",
    route: "llm", subject: "Özel Durum Açıklaması (Genel)", kind: "hold",
    headline: "Belirsiz kapsamlı işbirliği açıklaması", body: "Şirketimiz bir teknoloji şirketiyle stratejik işbirliği görüşmelerinin olumlu ilerlediğini ve ilk siparişlerin alındığını açıklamıştır. Tutar açıklanmamıştır.",
    sub_type: "other", sub_type_tr: "Belirsiz işbirliği", reader: null, leakage5d: 0.011, guardScore: 0.03,
    ruleTrace: [trace("HOLD.low_confidence", false, "0,71", "≥ 0,80", "Sınıflandırıcı güveni eşik altında: HOLD.")],
    reasonCodes: ["HOLD_LOW_CONFIDENCE"], llmCalls: 1, tokens: [1_900, 230],
  }),
  mk({
    ...NONE,
    slot: 117, run_id: "run-day-e4-dmoot", ticker: "DMOOT", event: "E4", classifiedAs: "E4", classifierConfidence: 0.99, method: "subject_map",
    route: "E4", subject: "Finansal Rapor", kind: "no_trade",
    headline: "2026 sonuçları güçlü, ancak hisse önceden yükselmiş", body: "Şirketimizin 2026 yılı konsolide finansal tabloları yayımlanmıştır. Satış hacmi ve kârlılık artmıştır.",
    sub_type: "financial_results", sub_type_tr: "Finansal sonuç",
    reader: e4Reader("Satış hacmi ve kârlılık artmıştır"),
    merge: { ratio: 1.8, amountInText: true }, leakage5d: 0.092,
    ruleTrace: [trace("E4.sue", true, "1,8", "≥ 1,0", "Beklenmeyen kâr güçlü."), trace("LEAK.ret5d", false, "+%9,2", "< %8", "Önceden fiyatlanmış: E4 atlanır.")],
    reasonCodes: ["LEAKAGE_SKIP"], guardScore: 0.02, llmCalls: 4, tokens: [11_300, 1_600],
  }),
  mk({
    ...NONE,
    slot: 131, run_id: "run-day-e3-mslhv", ticker: "MSLHV", event: "E3", classifiedAs: "E3", classifierConfidence: 0.95, method: "subject_map",
    route: "E3", subject: "İhale Süreci / Sonucu", kind: "no_trade",
    headline: "Kesinleşmiş ihale, gelire göre küçük", body: "Şirketimiz 180.000.000 TL bedelli ihaleyi kazanmış ve sözleşme imzalanmıştır. İş 18 ayda tamamlanacaktır.",
    sub_type: "tender_award_final", sub_type_tr: "Kesinleşmiş ihale",
    reader: e3Reader({ quote: "180.000.000 TL bedelli ihaleyi kazanmış", amount: 180_000_000, amountRaw: "180.000.000 TL", months: 18, binding: "tender_award_final", publicSector: true, subject: "Altyapı ihalesi" }),
    merge: { ratio: 0.04, denominatorName: "annual_revenue", denominator: 3_000_000_000, amountTry: 180_000_000, amountInText: true }, leakage5d: 0.004,
    ruleTrace: [trace("E3.materiality", false, "%4,0", "≥ %10 yıllık gelir", "Yıllıklandırılmış tutar eşik altında.")],
    reasonCodes: ["E3_RULE_NOT_MET"], guardScore: 0.01, llmCalls: 3, tokens: [8_600, 1_100],
  }),
  mk({
    ...NONE,
    slot: 22, run_id: "run-day-e1-tmsmk", ticker: "TMSMK", event: "E1", classifiedAs: "E1", classifierConfidence: 0.98, method: "subject_map",
    route: "E1", subject: "Pay Geri Alımına İlişkin Bildirim", kind: "propose",
    headline: "Geri alımlar sermayenin %0,34'üne ulaştı", body: "Şirketimiz son 10 seansta toplam 4.080.000 TL nominal değerli pay geri almıştır (sermayenin %0,34'ü).",
    sub_type: "buyback_execution", sub_type_tr: "Pay geri alım işlemi",
    reader: e1Reader("toplam 4.080.000 TL nominal değerli pay", 0.0034, 4_080_000),
    merge: { ratio: 0.0034, denominatorName: "paid_in_capital", denominator: 1_200_000_000, amountTry: 4_080_000, amountInText: true }, leakage5d: 0.014,
    evidence: { n: 64, nSameTicker: 1, mean5: 0.009, median5: 0.007, hit5: 0.58, mean20: 0.018, median20: 0.011, hit20: 0.58, ci20: [0.004, 0.031] },
    skeptic: { multiplier: 1, flags: [], counter_tr: "Ek risk bulunmadı." },
    ruleTrace: [trace("E1.capital_10d", true, "%0,34", "≥ %0,25", "Eşik üstünde."), trace("E1.execution", true, "gerçekleşen alım", "duyuru değil", "Gerçekleşen alım."), ...commonTrace("+%1,4", true, "2,7×", true, 64)],
    reasonCodes: ["E1_RULE_MET"], compliance: "pass", guardScore: 0.01,
    proposal: { refPrice: 88.4, qty: 560, stopPct: 0.085, holding: [20, 40], edgeBps: 90, costBps: 33, requestedNotional: 50_500, entry: "next_open_auction" },
    decision: { status: "approved", by: "uye-3", atIso: at("09:12"), comment: "Kanıt güçlü, sızıntı yok. Onay.", approvedNotional: null, fill: { price: 89.6, atIso: at("09:55"), slippageBps: 7 } },
    llmCalls: 5, tokens: [14_000, 2_000],
  }),
  mk({
    ...NONE,
    slot: 41, run_id: "run-day-e2-krgmd", ticker: "KRGMD", event: "E2", classifiedAs: "E2", classifierConfidence: 0.93, method: "subject_map",
    route: "E2", subject: "Pay Alım Satım Bildirimi", kind: "propose",
    headline: "Ana ortaktan 5,1 milyon TL'lik alım", body: "Ana ortağımız 08.01.2027 tarihinde borsada 5.100.000 TL tutarında pay satın almıştır.",
    sub_type: "insider_or_major_holder_trade", sub_type_tr: "Ana ortak alımı",
    reader: e2Reader("5.100.000 TL tutarında pay satın almıştır", 5_100_000),
    merge: { ratio: 0.0006, amountTry: 5_100_000, amountInText: true }, leakage5d: 0.061,
    evidence: { n: 9, nSameTicker: 0, mean5: 0.008, median5: 0.005, hit5: 0.56, mean20: 0.017, median20: 0.009, hit20: 0.56, ci20: [-0.02, 0.05] },
    skeptic: { multiplier: 0.5, flags: [{ code: "MANIPULATION_MARKERS", severity: "reduce", detail_tr: "Son 5 seansta +%6,1 ve hacim 3 katı." }], counter_tr: "Alım öncesi olağan dışı hacim; ×0,5." },
    ruleTrace: [trace("E2.open_market", true, "borsada", "piyasadan", "Borsada alım."), ...commonTrace("+%6,1", true, "2,0×", true, 9)],
    reasonCodes: ["E2_RULE_MET"], compliance: "pass", guardScore: 0.02,
    proposal: { refPrice: 57.75, qty: 380, stopPct: 0.1, holding: [20, 60], edgeBps: 66, costBps: 33, requestedNotional: 44_000, entry: "intraday_limit" },
    decision: { status: "rejected", by: "uye-3", atIso: at("10:20"), comment: "Hacim anormal; manipülasyon şüphesi taşıyan bir harekete girmek istemiyorum." },
    llmCalls: 5, tokens: [13_200, 1_900],
  }),
  mk({
    ...NONE,
    slot: 150, run_id: "run-day-ignore-orngd", ticker: "ORNGD", event: null, classifiedAs: "IGNORE", classifierConfidence: 0.91, method: "llm",
    route: "llm", subject: "Özel Durum Açıklaması (Genel)", kind: "archived",
    headline: "Basında çıkan haberlere ilişkin açıklama", body: "Basında şirketimizle ilgili çıkan haberlere ilişkin olarak, kamuya açıklanmamış bir gelişme bulunmadığını bildiririz.",
    sub_type: "other", sub_type_tr: "Diğer", reader: null, leakage5d: 0, guardScore: 0.02, llmCalls: 1, tokens: [1_700, 190],
  }),
];

/** Historical runs behind the open positions (paper period, v1.0/v1.1-fwd). */
function hist(slotId: string, ticker: string, event: "E1" | "E2" | "E4", date: string, refPrice: number, qty: number, fill: number, holding: [number, number], version: string): RunSpec {
  const subject = event === "E1" ? "Pay Geri Alımına İlişkin Bildirim" : event === "E2" ? "Pay Alım Satım Bildirimi" : "Finansal Rapor";
  return {
    ...mk({
      ...NONE,
      slot: 0, run_id: `run-hist-${slotId}`, ticker, event, classifiedAs: event, classifierConfidence: 0.96, method: "subject_map",
      route: event, subject, kind: "propose", publishedAtIso: istanbulIso(date, "08:20"),
      headline: event === "E1" ? "Geri alım eşiği aşıldı" : event === "E2" ? "Yönetici borsadan pay aldı" : "Beklenti üstü sonuç",
      body: "Geçmiş tarihli bildirim (ileri dönük paper dönemi).",
      sub_type: event === "E1" ? "buyback_execution" : event === "E2" ? "insider_or_major_holder_trade" : "financial_results",
      sub_type_tr: event === "E1" ? "Pay geri alım işlemi" : event === "E2" ? "Yönetici pay alımı" : "Finansal sonuç",
      reader: event === "E1" ? e1Reader("nominal değerli pay", 0.003, 3_000_000) : event === "E2" ? e2Reader("pay satın almıştır", 2_000_000) : e4Reader("kâr artmıştır"),
      merge: { ratio: 0.003, amountInText: true }, leakage5d: 0.01,
      evidence: { n: 40, nSameTicker: 1, mean5: 0.01, median5: 0.008, hit5: 0.59, mean20: 0.02, median20: 0.013, hit20: 0.59, ci20: [0.003, 0.036] },
      skeptic: { multiplier: 1, flags: [], counter_tr: "Ek risk bulunmadı." },
      ruleTrace: [trace(`${event}.rule`, true, "✓", "✓", "Kural sağlandı."), ...commonTrace("+%1,0", true, "2,5×", true, 40)],
      reasonCodes: [`${event}_RULE_MET`], compliance: "pass", guardScore: 0.01,
      proposal: { refPrice, qty, stopPct: 0.09, holding, edgeBps: 85, costBps: 33, requestedNotional: refPrice * qty, entry: "next_open_auction" },
      decision: { status: "approved", by: "uye-3", atIso: istanbulIso(date, "09:05"), comment: "Onay.", fill: { price: fill, atIso: istanbulIso(date, "09:55"), slippageBps: 6 } },
      llmCalls: 5, tokens: [14_000, 2_000], strategy_version: version,
    }),
    disclosure_index: 1_640_000 + Number(slotId.replace(/\D/g, "")),
  };
}

/**
 * Friday-evening disclosures approved before today's open (08:45 brief, "açılışta girilecek
 * emirler"): one OPG order filled only in part at the 09:55 auction match, one that lapsed
 * because the stock opened at the upper limit, above the buy limit (no chasing).
 */
function forTodaysOpen(h: RunSpec, publishedHhmm: string, approvedHhmm: string, outcome: { filledQty: number; price: number } | "limit_up"): RunSpec {
  const prev = h.decision;
  if (!prev) return h;
  return {
    ...h,
    publishedAtIso: istanbulIso("2027-01-08", publishedHhmm),
    decision: {
      ...prev,
      atIso: istanbulIso(DEMO_DAY, approvedHhmm),
      comment: outcome === "limit_up" ? "Onay; açılışta tavan gelirse kovalamıyoruz." : "Onay; açılış emir toplamada girsin.",
      fill: outcome === "limit_up" ? undefined : { price: outcome.price, atIso: istanbulIso(DEMO_DAY, "09:55"), slippageBps: 9, qty: outcome.filledQty },
      unfilledAtLimitUp: outcome === "limit_up",
    },
  };
}

export const HISTORY_SPECS: readonly RunSpec[] = [
  hist("101", "DMOKM", "E1", "2026-12-14", 47.9, 1_000, 48.1, [20, 40], "v1.0-fwd"),
  hist("102", "MSLCM", "E2", "2026-12-21", 43.2, 1_100, 43.5, [20, 60], "v1.1-fwd"),
  hist("103", "FRZEN", "E1", "2026-12-28", 23.6, 2_100, 23.7, [20, 40], "v1.1-fwd"),
  hist("104", "ORNTX", "E2", "2027-01-04", 18.1, 2_600, 18.2, [20, 60], "v1.1-fwd"),
  hist("105", "KRGSG", "E4", "2027-01-04", 25.4, 1_800, 25.5, [5, 10], "v1.1-fwd"),
  forTodaysOpen(hist("106", "DMOEN", "E1", "2027-01-08", 35.9, 1_400, 36.4, [20, 40], "v1.1-fwd"), "18:42", "08:31", { filledQty: 820, price: 36.52 }),
  forTodaysOpen(hist("107", "MSLIL", "E2", "2027-01-08", 58.02, 800, 58.5, [20, 60], "v1.1-fwd"), "19:06", "08:38", "limit_up"),
];
