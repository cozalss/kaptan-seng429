import type { DisclosureListItem } from "@/lib/domain/disclosure";
import type { ApprovalCard } from "@/lib/domain";
import type { Digest, DigestItem, DigestKind } from "@/lib/domain/digest";
import type { SignalItem, SignalTone } from "@/lib/domain/signal";
import { KIND_TITLE } from "@/lib/digest/digest";
import { ISSUERS } from "@/mocks/issuers";
import { isTradingDay, nextTradingDay, prevTradingDay } from "@/lib/time";
import { ApiError, type KaptanApi } from "../types";
import type { MockCtx } from "./guard";
import * as sel from "./selectors";

/**
 * The test double of the digest. It reads the double's own disclosures of the day and keeps the ones the server
 * would: classified E1, E2, E3 or E4 (the double's classes), with the same plain lines. Fiction, like the issuers.
 */
const KIND_OF: Readonly<Record<string, DigestKind>> = { E1: "buyback", E2: "insider", E3: "contract", E4: "earnings" };
const KIND_ORDER: readonly DigestKind[] = ["restriction", "insider", "contract", "earnings", "dividend", "capital", "merger", "buyback"];
const OUTSIDE = "KAPtan bu hisseye öneri vermez (işlem hacmi düşük)";
const WATCHED_OUTSIDE = "Listenin dışında, ama izleme listende: KAPtan inceler (işlem hacmi düşük)";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const istanbulDay = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const money = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Reading {
  line: string;
  tone: SignalTone;
  so_what: string | null;
}

/** The double's rule-made line per kind, in the server's words (numbers only where a parser would read them). */
function readingOf(kind: DigestKind, d: DisclosureListItem): Reading {
  const n = d.disclosure_index;
  const at = new Date(Date.parse(d.published_at) + 3 * 3_600_000);
  switch (kind) {
    case "buyback":
      return {
        line: `Kendi hissesinden ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} günü ${(5000 + (n % 7) * 2500).toLocaleString("tr-TR")} adet aldı, hisse başı ${money(10 + (n % 90) + 0.25)} ₺.`,
        tone: "olumlu",
        so_what: "Şirket kendi hissesini alıyor; bu genelde fiyatı destekler. Yapman gereken bir şey yok.",
      };
    case "insider":
      return n % 2 === 0
        ? { line: "Yönetici ya da büyük ortak hisse aldı.", tone: "olumlu", so_what: "İçeriden alım genelde şirkete güvenin işareti sayılır; tek başına karar için yetmez." }
        : { line: "Yönetici ya da büyük ortak hisse sattı.", tone: "olumsuz", so_what: "Dikkat işareti; neden sattığı duyuruda yazıyor olabilir, bir bak." };
    case "contract":
      return n % 2 === 0
        ? { line: `Yeni bir iş anlaşması bildirdi: ${(20 + (n % 9) * 10).toLocaleString("tr-TR")},00 milyon ₺. Şirketin yıllık cirosunun yaklaşık %${(1 + (n % 5)).toLocaleString("tr-TR")},0'i.`, tone: "olumlu", so_what: "Ciroya göre küçük bir iş fiyatı pek oynatmaz; büyükse ilgi çekebilir." }
        : { line: "Bir ihale süreci ya da sonucu bildirdi.", tone: "belirsiz", so_what: null };
    case "earnings":
      return { line: "2026 üçüncü çeyrek finansal tablolarını açıkladı.", tone: "belirsiz", so_what: null };
    case "dividend":
      return { line: "Kâr payı dağıtımıyla ilgili bildirim yayımladı.", tone: "olumlu", so_what: "Kâr payı, şirketin kazancını ortaklarıyla paylaşmasıdır; tutarı ve tarihi duyuruda." };
    case "capital":
      return { line: "Bedelsiz sermaye artırımı bildirdi: elindeki hisse sayısı artar, toplam değer aynı kalır.", tone: "notr", so_what: "Hisse sayın artar ama şirketin değeri değişmez; fiyat buna göre düşer." };
    case "merger":
      return { line: "Birleşme işlemiyle ilgili bildirim yayımladı.", tone: "belirsiz", so_what: null };
    case "restriction":
      return { line: "SPK bu hisse için tedbir kararı yayımladı; işlem kısıtı olabilir.", tone: "olumsuz", so_what: "İşlem kısıtı olabilir; alıp satmadan önce duyuruya bak." };
  }
}

/** KAPtan's word on a disclosure, from the double's approval card for it. */
function suggestionOf(card: ApprovalCard | undefined, held: boolean): string | null {
  if (!card) return null;
  if (card.status === "pending") return `KAPtan: ${card.side === "buy" ? "al" : "sat"} önerisi hazır`;
  if (card.status === "approved") return "KAPtan: önerini onayladın";
  if (card.status === "rejected") return "KAPtan: öneriyi reddettin";
  return held ? "KAPtan: tut" : "KAPtan: işlem önermiyor";
}

/** The Signal of a double disclosure; null when it is not important (the same rule as the digest). */
export function signalOf(d: DisclosureListItem, held: Set<string>, watched: Set<string>, cards: ReadonlyMap<number, ApprovalCard> = new Map()): SignalItem | null {
  const kind = KIND_OF[d.classification?.event_type ?? ""];
  const ticker = d.primary_ticker ?? d.stock_codes[0];
  if (!kind || !ticker || d.is_noise || d.reason !== "NEW") return null;
  const r = readingOf(kind, d);
  return {
    disclosure_index: d.disclosure_index,
    ticker,
    company_name: d.company_name,
    published_at: d.published_at,
    kind,
    important: true,
    mine: held.has(ticker) ? "held" : watched.has(ticker) ? "watched" : null,
    line_tr: r.line,
    tone: r.tone,
    so_what_tr: r.so_what,
    suggestion_tr: suggestionOf(cards.get(d.disclosure_index), held.has(ticker)),
    kap_url: `https://www.kap.org.tr/tr/Bildirim/${d.disclosure_index}`,
    panel_path: `/bildirimler?gun=${istanbulDay(Date.parse(d.published_at))}&bildirim=${d.disclosure_index}`,
    triage: null,
  };
}

function itemOf(d: DisclosureListItem, held: Set<string>, watched: Set<string>, cards: ReadonlyMap<number, ApprovalCard>): DigestItem | null {
  const sig = signalOf(d, held, watched, cards);
  if (!sig || !sig.ticker || !sig.kind) return null;
  const ticker = sig.ticker;
  const outside = !ISSUERS.some((i) => i.ticker === ticker && i.inUniverse);
  return {
    disclosure_index: d.disclosure_index,
    kind: sig.kind as DigestKind,
    ticker,
    company_name: d.company_name,
    line: sig.line_tr,
    headline: d.summary.trim() || null,
    published_at: d.published_at,
    source_url: sig.kap_url,
    why: sig.mine,
    outside_list: outside,
    outside_note: outside ? (watched.has(ticker) ? WATCHED_OUTSIDE : OUTSIDE) : null,
    tone: sig.tone,
    so_what_tr: sig.so_what_tr,
    suggestion_tr: sig.suggestion_tr,
    panel_path: sig.panel_path,
  };
}

const rank = (i: DigestItem) => (i.why === "held" ? 0 : i.why === "watched" ? 1 : 2);

export function createDigest(ctx: MockCtx): Pick<KaptanApi, "digest"> {
  const { db, me, ok } = ctx;
  return {
    async digest(dayArg?: string): Promise<Digest> {
      me();
      if (dayArg !== undefined && (!DAY_RE.test(dayArg) || Number.isNaN(Date.parse(dayArg)))) throw new ApiError(422, "validation", "Tarih bekleniyor (YYYY-MM-DD)");
      const today = istanbulDay(Date.parse(ctx.now()));
      const fellBack = dayArg === undefined && !isTradingDay(today);
      const day = dayArg ?? (fellBack ? prevTradingDay(today) : today);
      const held = new Set(sel.positions(db.snapshot).map((p) => p.ticker));
      const watched = new Set(db.snapshot.watchlist);
      const cards = new Map(sel.approvalCards(db.snapshot).map((c) => [c.disclosure_index, c] as const));
      const items = sel
        .disclosuresOn(db.snapshot, { day, limit: 500 })
        .map((d) => itemOf(d, held, watched, cards))
        .filter((i): i is DigestItem => i !== null)
        .sort((a, b) => rank(a) - rank(b) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.published_at.localeCompare(a.published_at));
      const open = isTradingDay(day);
      let next: string | null = nextTradingDay(day);
      if (next > today) next = null;
      const kinds = KIND_ORDER.map((kind) => ({ kind, title: KIND_TITLE[kind], count: items.filter((i) => i.kind === kind).length })).filter((k) => k.count > 0);
      return ok(
        {
          day,
          is_trading_day: open,
          note: fellBack ? "Borsa kapalı; son işlem gününün duyuruları." : open ? null : "Bu gün borsa kapalıydı.",
          prev_day: prevTradingDay(day),
          next_day: next,
          total: items.length,
          truncated: false,
          kinds,
          items,
        },
        80,
      );
    },
  };
}
