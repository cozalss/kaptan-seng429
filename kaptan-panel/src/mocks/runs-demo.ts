import { istanbulIso } from "@/lib/time";
import { DEMO_DAY } from "./clock";
import { DEMO_E3_INDEX, DEMO_E3_RUN } from "./ids";
import { commonTrace, e3Reader, trace } from "./readers";
import type { RunSpec } from "./run-spec";

/**
 * One more fixture run, outside the day's list (tests of a card that arrives while a screen is
 * open, and of the canonical order ticket). None of these companies exist.
 */
const AT = istanbulIso(DEMO_DAY, "13:41");

const E3_TEXT_TR = [
  "MİSAL ENERJİ A.Ş. — Özel Durum Açıklaması (Genel)",
  "",
  "Şirketimiz ile kamu sektöründe faaliyet gösteren bir enerji dağıtım şirketi arasında, 12 ay süreli ve 432.000.000 TL (KDV hariç) tutarlı bir bakım ve işletme hizmet sözleşmesi bugün imzalanmıştır. Sözleşme bedeli, şirketimizin son yıllık gelirinin %18'ine karşılık gelmektedir.",
  "Sözleşme taraflar için bağlayıcıdır. Karşı taraf şirketimizin ilişkili tarafı değildir; sözleşme mevcut bir sözleşmenin yenilenmesi veya uzatılması niteliğinde değildir.",
  "Sözleşme kapsamındaki hizmetlere 01.02.2027 tarihinde başlanacaktır.",
  "",
  "Bu metin KAPtan fikstürüdür; gerçek bir şirkete veya bildirime ait değildir.",
].join("\n");

const E3_TEXT_EN = [
  "MİSAL ENERJİ A.Ş. — Material Event Disclosure (General) · Illustrative",
  "",
  "Our Company signed today a 12-month operation and maintenance service agreement of TRY 432,000,000 (excluding VAT) with a public-sector energy distribution company. The contract value corresponds to 18% of our Company's latest annual revenue.",
  "The agreement is binding. The counterparty is not a related party, and the agreement is not a renewal or extension.",
  "Services under the agreement will start on 1 February 2027.",
  "",
  "This text is a KAPtan fixture; it does not belong to any real company or disclosure.",
].join("\n");

export const DEMO_E3_SPEC: RunSpec = {
  run_id: DEMO_E3_RUN,
  disclosure_index: DEMO_E3_INDEX,
  ticker: "ORNEK",
  event: "E3",
  classifiedAs: "E3",
  classifierConfidence: 0.93,
  method: "llm",
  route: "llm",
  subject: "Özel Durum Açıklaması (Genel)",
  kind: "propose",
  status: "interrupted",
  outcome: "PROPOSE",
  publishedAtIso: AT,
  headline_tr: "Yıllık gelirin %18'i tutarında bağlayıcı sözleşme",
  text_tr: E3_TEXT_TR,
  text_en: E3_TEXT_EN,
  sub_type: "contract_signed",
  sub_type_tr: "Bağlayıcı hizmet sözleşmesi",
  reader: e3Reader({
    quote: "12 ay süreli ve 432.000.000 TL (KDV hariç) tutarlı",
    amount: 432_000_000,
    amountRaw: "432.000.000 TL (KDV hariç)",
    months: 12,
    binding: "signed_contract",
    publicSector: true,
    subject: "Bakım ve işletme hizmet sözleşmesi",
    statedSharePct: 18,
  }),
  merge: { ratio: 0.18, denominatorName: "annual_revenue", denominator: 2_400_000_000, amountTry: 432_000_000, amountInText: true },
  leakage5d: 0.041,
  evidence: { n: 23, nSameTicker: 1, mean5: 0.014, median5: 0.011, hit5: 0.61, mean20: 0.019, median20: 0.012, hit20: 0.57, ci20: [-0.004, 0.042] },
  skeptic: {
    multiplier: 0.5,
    flags: [
      {
        code: "OTHER",
        severity: "reduce",
        detail_tr: "Bildirimden önceki 2 borsa gününde +%3,6 anormal hareket var; bilgi kısmen fiyatlanmış olabilir.",
      },
    ],
    counter_tr: "Bildirimden önceki 2 borsa gününde +%3,6 anormal hareket var, bilgi kısmen fiyatlanmış olabilir. Öneri: tutar %50 küçültülsün.",
  },
  ruleTrace: [
    trace("E3.materiality", true, "%18", "≥ %10 yıllık gelir", "Yıllıklandırılmış tutar yıllık gelirin %18'i."),
    trace("E3.binding", true, "imzalı sözleşme", "bağlayıcı", "Sözleşme bağlayıcı."),
    trace("E3.not_related_party", true, "ilişkili değil", "ilişkili taraf değil", "Karşı taraf ilişkili taraf değil."),
    trace("E3.not_renewal", true, "yeni iş", "yenileme değil", "Yenileme veya uzatma değil."),
    trace("E3.amount_in_text", true, "432.000.000 TL", "regex eşleşmesi", "Okuyucu tutarı metindeki tutarla eşleşti (R14)."),
    ...commonTrace("+%4,1", true, "2,1×", true, 23),
  ],
  reasonCodes: ["E3_RULE_MET"],
  compliance: "pass",
  guardScore: 0.02,
  proposal: {
    refPrice: 47.4,
    qty: 1_240,
    stopPct: 0.087,
    holding: [5, 5],
    edgeBps: 70,
    costBps: 33,
    requestedNotional: 119_908,
    entry: "intraday_limit",
  },
  decision: { status: "pending" },
  strategy_version: "v1.1-fwd",
  is_fixture: true,
  classifierQuotes: [
    { field: "event_type", quote: "bakım ve işletme hizmet sözleşmesi bugün imzalanmıştır" },
    { field: "materiality", quote: "son yıllık gelirinin %18'ine karşılık gelmektedir" },
    { field: "binding", quote: "Sözleşme taraflar için bağlayıcıdır" },
  ],
  sourceSpans: [
    { field: "amount", quote: "432.000.000 TL (KDV hariç)" },
    { field: "share_of_revenue", quote: "yıllık gelirinin %18'ine" },
    { field: "binding", quote: "bağlayıcıdır" },
    { field: "related_party", quote: "ilişkili tarafı değildir" },
    { field: "renewal", quote: "yenilenmesi veya uzatılması niteliğinde değildir" },
  ],
  llmCalls: 6,
  tokens: [16_400, 2_510],
};

export const DEMO_SPECS: readonly RunSpec[] = [DEMO_E3_SPEC];
