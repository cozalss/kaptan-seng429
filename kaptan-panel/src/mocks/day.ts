import type { DisclosureListItem, SubjectRoute } from "@/lib/domain";
import { disclosureOf } from "./explain-builder";
import { sha256Hex } from "@/lib/hash";
import { DAY_BY_ANCHOR, DAY_INDEX_BASE, DAY_TOTAL } from "./ids";
import { ISSUERS } from "./issuers";
import { createRng } from "./rng";
import { DAY_SPECS } from "./runs-day";
import { slotTime } from "./day-times";

/**
 * One trading day of disclosures (11 Jan 2027): 318 rows, mostly noise and archive,
 * with the 13 processed rows from runs-day. Deterministic (seed 20270111).
 */
interface Template {
  subject: string;
  route: SubjectRoute;
  cls: DisclosureListItem["disclosure_class"];
  summary: string;
}

const NOISE: Template = {
  subject: "Devre Kesici Uygulanması",
  route: "noise",
  cls: "DUY",
  summary: "Pay bazında devre kesici uygulandı (otomatik bildirim).",
};

const ARCHIVE: readonly Template[] = [
  { subject: "Genel Kurul İşlemlerine İlişkin Bildirim", route: "archive_only", cls: "ODA", summary: "Olağan genel kurul toplantı ilanı." },
  { subject: "Kar Payı Dağıtım İşlemlerine İlişkin Bildirim", route: "archive_only", cls: "ODA", summary: "Kâr payı dağıtım takvimi." },
  { subject: "Borçlanma Aracı İhracı", route: "archive_only", cls: "ODA", summary: "Finansman bonosu ihracı tamamlandı." },
  { subject: "Pay Dışında Sermaye Piyasası Aracı İşlemlerine İlişkin Bildirim", route: "archive_only", cls: "ODA", summary: "Kupon ödemesi yapıldı." },
  { subject: "Yönetim Kurulu Komitelerine İlişkin Bildirim", route: "archive_only", cls: "DG", summary: "Komite üyeleri belirlendi." },
  { subject: "Şirket Genel Bilgi Formu", route: "archive_only", cls: "DG", summary: "İletişim bilgileri güncellendi." },
  { subject: "Kurumsal Yönetim Uyum Raporu", route: "archive_only", cls: "DG", summary: "Uyum raporu yayımlandı." },
  { subject: "Sorumluluk Beyanı", route: "archive_only", cls: "DG", summary: "Finansal tablolara ilişkin sorumluluk beyanı." },
  { subject: "Faaliyet Raporu", route: "archive_only", cls: "FR", summary: "Ara dönem faaliyet raporu." },
  { subject: "Sermaye Artırımı - Bedelsiz", route: "avoid:bonus_issue", cls: "ODA", summary: "Bedelsiz sermaye artırımı için SPK'ya başvuru." },
  { subject: "Sermaye Artırımı - Bedelli", route: "avoid:dilutive_rights", cls: "ODA", summary: "Bedelli sermaye artırımı kararı." },
  { subject: "Borsa İstanbul Tedbir Duyurusu", route: "avoid:measure", cls: "DUY", summary: "Pay için tedbir uygulandığı duyuruldu (temsili)." },
  { subject: "Özel Durum Açıklaması (Genel)", route: "archive_only", cls: "ODA", summary: "Şube açılışı hakkında bilgilendirme." },
  { subject: "Derecelendirme", route: "archive_only", cls: "ODA", summary: "Kredi derecelendirme notu teyit edildi." },
];

function rowFrom(slot: number, t: Template, ticker: string, name: string, multilang: boolean): DisclosureListItem {
  const published = slotTime(slot);
  const seen = new Date(Date.parse(published) + 18_000 + (slot % 9) * 1_000).toISOString();
  return {
    disclosure_index: DAY_INDEX_BASE + slot,
    disclosure_oid: sha256Hex(`oid:${DAY_INDEX_BASE + slot}`).slice(0, 32),
    stock_codes: [ticker],
    related_stocks: [],
    primary_ticker: ticker,
    company_name: name,
    disclosure_class: t.cls,
    disclosure_type: t.cls === "DUY" ? "Duyuru" : t.cls === "FR" ? "Finansal Rapor" : "Özel Durum Açıklaması",
    subject: t.subject,
    summary: t.summary,
    reason: slot % 37 === 5 ? "CORR" : slot % 29 === 3 ? "UPD" : "NEW",
    related_index: slot % 37 === 5 ? DAY_INDEX_BASE + slot - 4 : null,
    is_late: slot % 53 === 11,
    attachment_count: t.cls === "FR" ? 2 : slot % 7 === 0 ? 1 : 0,
    has_multilang: multilang,
    is_noise: t.route === "noise",
    subject_route: t.route,
    subject_map_version: "subject_map.v1",
    published_at: published,
    first_seen_at: seen,
    available_at: seen,
    ingest_source: "live",
    classification: t.route === "noise" ? null : { event_type: t.route.startsWith("avoid:") ? "FILTER" : "IGNORE", confidence: 1, method: "subject_map" },
    run_id: null,
    linked_news_count: 0,
    note_count: 0,
  };
}

function build(): DisclosureListItem[] {
  const rng = createRng(20_270_111);
  const processed = new Map(DAY_SPECS.map((s) => [s.disclosure_index - DAY_INDEX_BASE, s]));
  // Decide which pre-anchor slots are noise: exactly 61 of the 199 non-processed ones.
  const preSlots = Array.from({ length: DAY_BY_ANCHOR.total }, (_, i) => i).filter((i) => !processed.has(i));
  const shuffled = [...preSlots];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as number, shuffled[i] as number];
  }
  const noiseSlots = new Set(shuffled.slice(0, DAY_BY_ANCHOR.noise));
  const tradable = ISSUERS.filter((i) => i.inUniverse);
  const rows: DisclosureListItem[] = [];
  for (let slot = 0; slot < DAY_TOTAL; slot += 1) {
    const spec = processed.get(slot);
    if (spec) {
      rows.push(disclosureOf(spec));
      continue;
    }
    const iss = rng.pick(ISSUERS);
    const isNoise = slot < DAY_BY_ANCHOR.total ? noiseSlots.has(slot) : rng.chance(0.28);
    const t = isNoise ? NOISE : rng.pick(ARCHIVE);
    const who = isNoise ? rng.pick(tradable) : iss;
    rows.push(rowFrom(slot, t, who.ticker, who.name, t.cls === "ODA" || rng.chance(0.4)));
  }
  return rows;
}

let cache: DisclosureListItem[] | null = null;

/** All 318 rows of the day in publication order (memoised). */
export function dayDisclosures(): readonly DisclosureListItem[] {
  cache ??= build();
  return cache;
}
