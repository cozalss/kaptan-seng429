import type { SignalItem, SignalList } from "@/lib/domain/signal";
import { isTradingDay, prevTradingDay } from "@/lib/time";
import { ApiError, type KaptanApi } from "../types";
import type { MockCtx } from "./guard";
import { signalOf } from "./digest";
import * as sel from "./selectors";

/**
 * The test double of the signals (backend kaptan.api.routers.signals): the important disclosures of a day with
 * line, tone, so-what, suggestion and the person's triage state. Triage lives in the reading marks (reading.ts).
 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const istanbulDay = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);
const RANK = { held: 0, watched: 1 } as const;

export function createSignals(ctx: MockCtx, triageOf: () => Readonly<Record<string, SignalItem["triage"]>>): Pick<KaptanApi, "signals" | "signal"> {
  const { db, me, ok } = ctx;
  const context = () => ({
    held: new Set(sel.positions(db.snapshot).map((p) => p.ticker)),
    watched: new Set(db.snapshot.watchlist),
    cards: new Map(sel.approvalCards(db.snapshot).map((c) => [c.disclosure_index, c] as const)),
  });
  const withTriage = (s: SignalItem): SignalItem => ({ ...s, triage: triageOf()[String(s.disclosure_index)] ?? null });

  return {
    async signals(dayArg?: string): Promise<SignalList> {
      me();
      if (dayArg !== undefined && (!DAY_RE.test(dayArg) || Number.isNaN(Date.parse(dayArg)))) throw new ApiError(422, "validation", "Tarih bekleniyor (YYYY-MM-DD)");
      const today = istanbulDay(Date.parse(ctx.now()));
      const fellBack = dayArg === undefined && !isTradingDay(today);
      const day = dayArg ?? (fellBack ? prevTradingDay(today) : today);
      const { held, watched, cards } = context();
      const items = sel
        .disclosuresOn(db.snapshot, { day, limit: 500 })
        .map((d) => signalOf(d, held, watched, cards))
        .filter((s): s is SignalItem => s !== null)
        .map(withTriage)
        .sort((a, b) => (a.mine ? RANK[a.mine] : 2) - (b.mine ? RANK[b.mine] : 2) || b.published_at.localeCompare(a.published_at));
      const mine = items.filter((i) => i.mine !== null).length;
      return ok(
        { day, note: fellBack ? "Borsa kapalı; son işlem gününün duyuruları." : isTradingDay(day) ? null : "Bu gün borsa kapalıydı.", mine_count: mine, other_count: items.length - mine, items },
        80,
      );
    },
    async signal(index: number): Promise<SignalItem> {
      me();
      const d = sel.visibleDisclosures(db.snapshot).find((x) => x.disclosure_index === index);
      if (!d) throw new ApiError(404, "not_found", "Bu bildirimi bulamadım.");
      const { held, watched, cards } = context();
      const sig = signalOf(d, held, watched, cards);
      if (sig) return ok(withTriage(sig), 40);
      const ticker = d.primary_ticker ?? d.stock_codes[0] ?? null;
      return ok(
        {
          disclosure_index: index,
          ticker,
          company_name: d.company_name,
          published_at: d.published_at,
          kind: null,
          important: false,
          mine: ticker && held.has(ticker) ? "held" : ticker && watched.has(ticker) ? "watched" : null,
          line_tr: d.subject,
          tone: "belirsiz",
          so_what_tr: null,
          suggestion_tr: null,
          kap_url: `https://www.kap.org.tr/tr/Bildirim/${index}`,
          panel_path: `/bildirimler?bildirim=${index}`,
          triage: null,
        },
        40,
      );
    },
  };
}
