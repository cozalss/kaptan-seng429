import type { DisclosureListItem } from "@/lib/domain/disclosure";
import type { Digest, DigestItem, DigestKind } from "@/lib/domain/digest";
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
const LINE: Readonly<Record<DigestKind, string>> = {
  restriction: "SPK bu hisse için tedbir kararı yayımladı; işlem kısıtı olabilir.",
  insider: "Şirketin yöneticisi ya da büyük ortağı hisse aldı.",
  contract: "Yeni bir iş ilişkisi bildirdi.",
  earnings: "Finansal tablolarını açıkladı.",
  dividend: "Kâr payı dağıtımıyla ilgili bildirim yayımladı.",
  capital: "Sermaye artırımı ya da azaltımıyla ilgili bildirim yayımladı.",
  merger: "Birleşme işlemiyle ilgili bildirim yayımladı.",
  buyback: "Kendi hissesini borsadan geri aldığını bildirdi.",
};
const KIND_ORDER: readonly DigestKind[] = ["restriction", "insider", "contract", "earnings", "dividend", "capital", "merger", "buyback"];
const OUTSIDE = "KAPtan bu hisseye öneri vermez (işlem hacmi düşük)";
const WATCHED_OUTSIDE = "Listenin dışında, ama izleme listende: KAPtan inceler (işlem hacmi düşük)";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const istanbulDay = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);

function itemOf(d: DisclosureListItem, held: Set<string>, watched: Set<string>): DigestItem | null {
  const kind = KIND_OF[d.classification?.event_type ?? ""];
  const ticker = d.primary_ticker ?? d.stock_codes[0];
  if (!kind || !ticker) return null;
  const outside = !ISSUERS.some((i) => i.ticker === ticker && i.inUniverse);
  return {
    disclosure_index: d.disclosure_index,
    kind,
    ticker,
    company_name: d.company_name,
    line: LINE[kind],
    headline: d.summary.trim() || null,
    published_at: d.published_at,
    source_url: `https://www.kap.org.tr/tr/Bildirim/${d.disclosure_index}`,
    why: held.has(ticker) ? "held" : watched.has(ticker) ? "watched" : null,
    outside_list: outside,
    outside_note: outside ? (watched.has(ticker) ? WATCHED_OUTSIDE : OUTSIDE) : null,
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
      const items = sel
        .disclosuresOn(db.snapshot, { day, limit: 500 })
        .map((d) => itemOf(d, held, watched))
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
