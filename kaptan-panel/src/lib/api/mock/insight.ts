import type { Company, CompanyHit, DisclosureReading, PastDecision, Period, PricePoint, SearchResult, WatchItem } from "@/lib/company/company";
import { MAX_WATCHED } from "@/lib/company/company";
import { foldTr, rankCompany } from "@/lib/company/fold";
import { ISSUERS } from "@/mocks/issuers";
import { ApiError, type KaptanApi } from "../types";
import { userActor, type MockCtx } from "./guard";
import * as sel from "./selectors";

/**
 * The test double of the company page, search and the watchlist. Prices are a small deterministic walk
 * that ends at the double's own price (fiction, like the issuers); nothing here is a real quote.
 */
const DAYS: Readonly<Record<Period, number>> = { "1m": 22, "3m": 63, "1y": 252, all: 400 };
const CODE = /^[A-Za-z0-9]{3,6}$/;
const round2 = (n: number) => Math.round(n * 100) / 100;

function walk(ticker: string, last: number, n: number, endDay: string): PricePoint[] {
  let seed = [...ticker].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);
  const out: PricePoint[] = [];
  let price = last;
  let day = Date.parse(`${endDay}T00:00:00Z`);
  for (let i = 0; i < n; i += 1) {
    while ([0, 6].includes(new Date(day).getUTCDay())) day -= 86_400_000;
    out.push({ d: new Date(day).toISOString().slice(0, 10), close: round2(price) });
    seed = (seed * 48271) % 2147483647;
    price /= 1 + ((seed % 200) - 100) / 5000;
    day -= 86_400_000;
  }
  return out.reverse();
}

const TAIL: Readonly<Record<string, string>> = {
  approved: "önerdim, onayladın.",
  rejected: "önerdim, reddettin.",
  expired: "önerdim; süresi doldu.",
  cancelled: "önerdim; öneri iptal oldu.",
};

export function createInsight(ctx: MockCtx): Pick<KaptanApi, "company" | "search" | "watchlist" | "watch" | "unwatch" | "disclosureReading"> {
  const { db, me, ok } = ctx;
  const today = () => ctx.now().slice(0, 10);

  const strip = (): WatchItem[] =>
    db.snapshot.watchlist.flatMap((t) => {
      const i = ISSUERS.find((x) => x.ticker === t);
      if (!i) return [];
      const bars = walk(t, i.price, 2, today());
      const last = bars[1]?.close ?? i.price;
      const prev = bars[0]?.close ?? i.price;
      const newest = sel.visibleDisclosures(db.snapshot).find((d) => d.stock_codes.includes(t));
      return [{ ticker: t, name: i.name, added_at: ctx.now(), last_close: last, price_day: today(), change_pct: round2((last / prev - 1) * 100), newest_disclosure_at: newest?.published_at ?? null }];
    });

  const decisionsOf = (ticker: string): PastDecision[] =>
    sel
      .approvalCards(db.snapshot)
      .filter((c) => c.ticker === ticker && !c.run_id.startsWith("run-hist"))
      .map((c) => ({
        run_id: c.run_id,
        disclosure_index: c.disclosure_index,
        decision: "suggested" as const,
        event_type: c.event_type,
        why_tr: `${c.side === "sell" ? "Satmanı" : "Almanı"} ${TAIL[c.status] ?? "öneriyorum. Karar senin."}`,
        at: c.created_at,
        proposal_id: c.proposal_id,
        approval_status: c.status,
        side: c.side,
      }));

  return {
    async company(ticker, period = "3m") {
      me();
      const code = ticker.toUpperCase();
      const i = ISSUERS.find((x) => x.ticker === code);
      if (!CODE.test(code) || !i) throw new ApiError(404, "not_found", "Bu kodla bir şirket bulamadım.");
      const points = walk(code, i.price, DAYS[period], today());
      const last = points.at(-1)?.close ?? null;
      const prev = points.at(-2)?.close ?? null;
      const held = sel.positions(db.snapshot).filter((p) => p.ticker === code);
      const qty = held.reduce((a, p) => a + p.qty, 0);
      const cost = qty ? held.reduce((a, p) => a + p.qty * p.avg_cost, 0) / qty : 0;
      const doc: Company = {
        ticker: code,
        name: i.name,
        sector: i.sector,
        market: null,
        following: { in_universe: i.inUniverse, known: true, reasons_tr: i.inUniverse ? [] : ["Günlük işlem hacmi çok düşük; istediğin kadarını rahat alıp satamazsın."] },
        watched: db.snapshot.watchlist.includes(code),
        price: { period, points, last_close: last, last_day: points.at(-1)?.d ?? null, change_pct: last && prev ? round2((last / prev - 1) * 100) : null },
        position: qty && last ? { qty, avg_cost: cost, last_price: last, gain_try: round2((last - cost) * qty), gain_pct: round2((last / cost - 1) * 100), since: held[0]?.opened_at ?? ctx.now() } : null,
        disclosures: sel.visibleDisclosures(db.snapshot).filter((d) => d.stock_codes.includes(code)).slice(0, 30),
        decisions: decisionsOf(code),
      };
      return ok(doc, 120);
    },

    async search(q) {
      me();
      const query = q.trim().slice(0, 60);
      if (query.length < 2) return ok<SearchResult>({ q: query, companies: [], disclosures: [] }, 40);
      const companies: CompanyHit[] = ISSUERS.flatMap((i) => {
        const r = rankCompany(query, i.ticker, i.name);
        return r === null ? [] : [{ r, hit: { ticker: i.ticker, name: i.name, sector: i.sector } }];
      })
        .sort((a, b) => a.r - b.r || a.hit.ticker.localeCompare(b.hit.ticker))
        .slice(0, 8)
        .map((x) => x.hit);
      const words = foldTr(query).split(" ").slice(0, 5);
      const disclosures = sel
        .visibleDisclosures(db.snapshot)
        .filter((d) => !d.is_noise && words.every((w) => foldTr(`${d.subject} ${d.summary} ${d.company_name}`).includes(w)))
        .slice(0, 10)
        .map((d) => ({ disclosure_index: d.disclosure_index, ticker: d.primary_ticker, company_name: d.company_name, subject: d.subject, published_at: d.published_at }));
      return ok({ q: query, companies, disclosures }, 60);
    },

    async watchlist() {
      me();
      return ok(strip(), 60);
    },

    async watch(ticker) {
      const a = me();
      const code = ticker.toUpperCase();
      if (!ISSUERS.some((i) => i.ticker === code)) throw new ApiError(404, "not_found", "Bu kodla bir şirket bulamadım.");
      if (!db.snapshot.watchlist.includes(code)) {
        if (db.snapshot.watchlist.length >= MAX_WATCHED) throw new ApiError(409, "watchlist_full", `İzleme listen dolu (${MAX_WATCHED} şirket). Birini çıkar, sonra ekle.`);
        db.update((s) => ({ ...s, watchlist: [...s.watchlist, code] }));
        db.audit(userActor(a), "watchlist.added", "watchlist", code, { ticker: code });
      }
      return ok(strip(), 80);
    },

    async unwatch(ticker) {
      const a = me();
      const code = ticker.toUpperCase();
      if (db.snapshot.watchlist.includes(code)) {
        db.update((s) => ({ ...s, watchlist: s.watchlist.filter((t) => t !== code) }));
        db.audit(userActor(a), "watchlist.removed", "watchlist", code, { ticker: code });
      }
      return ok(strip(), 80);
    },

    async disclosureReading(index) {
      me();
      const d = sel.visibleDisclosures(db.snapshot).find((x) => x.disclosure_index === index);
      if (!d) throw new ApiError(404, "not_found", "Bu bildirimi bulamadım.");
      const card = sel.approvalCards(db.snapshot).find((c) => c.disclosure_index === index);
      const reading: DisclosureReading = {
        ...d,
        texts: [{ lang: "tr", body: d.summary }],
        numbers: [],
        decision: card ? "suggested" : null,
        proposal_id: card?.proposal_id ?? null,
        approval_status: card?.status ?? null,
        side: card?.side ?? null,
      };
      return ok(reading, 80);
    },
  };
}
