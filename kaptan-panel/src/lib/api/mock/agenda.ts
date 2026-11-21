import type { Calendar, CalendarEvent, MarketStrip } from "@/lib/domain/agenda";
import { ApiError, type KaptanApi } from "../types";
import type { MockCtx } from "./guard";
import * as sel from "./selectors";

/**
 * The test double of the calendar and the market strip. Dates are relative to the double's clock and are
 * fiction (like its issuers); the rate-decision day is the central bank's published one.
 */
const PPK_2026 = ["2026-12-10"];
const DAY_MS = 86_400_000;
const MAX_DAYS = 120;
const NOTE_NO_INFLATION = "Enflasyon açıklama günlerini göstermiyorum: resmi takvimi güvenle okuyamadım, elle yazılmış tarih koymam.";

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const istanbulWeekday = (ms: number) => new Date(ms + 3 * 3_600_000).getUTCDay();

function istanbulOpen(nowMs: number): boolean {
  const local = new Date(nowMs + 3 * 3_600_000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return ![0, 6].includes(local.getUTCDay()) && minutes >= 600 && minutes < 1090;
}

export function createAgenda(ctx: MockCtx): Pick<KaptanApi, "calendar" | "marketStrip"> {
  const { db, me, ok } = ctx;
  return {
    async calendar(days = 60): Promise<Calendar> {
      me();
      if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) throw new ApiError(422, "validation", "Gün sayısı 1 ile 120 arasında olmalı.");
      const now = Date.parse(ctx.now());
      const from = ymd(now);
      const to = ymd(now + days * DAY_MS);
      const held = sel.positions(db.snapshot).map((p) => p.ticker);
      const why = (t: string): "held" | "watched" => (held.includes(t) ? "held" : "watched");
      const events: CalendarEvent[] = [];
      [...new Set([...held, ...db.snapshot.watchlist])].slice(0, 6).forEach((t, i) => {
        const day = ymd(now + (4 + i * 3) * DAY_MS);
        if (day > to) return;
        events.push({ id: `fr-${t}-${day}`, day, kind: "report_window", ticker: t, why: why(t), title: `${t}: finansal rapor bu günlerde beklenir`, detail: "Geçen yıl bu rapor aşağı yukarı bu günlerde açıklandı. Bu yıl da yakın bir günde gelebilir; kesin gün değil.", source_url: null, approximate: true });
      });
      const first = held[0];
      if (first) {
        const day = ymd(now + 9 * DAY_MS);
        if (day <= to) events.push({ id: `kp-${first}-${day}`, day, kind: "dividend_pay", ticker: first, why: "held", title: `${first}: kâr payı ödeme günü`, detail: "Şirketin bildirimine göre kâr payı bu gün ödenir.", source_url: "https://www.kap.org.tr/tr/Bildirim/1", approximate: false });
      }
      for (const day of PPK_2026.filter((d) => d >= from && d <= to)) {
        events.push({ id: `ppk-${day}`, day, kind: "rate_decision", ticker: null, why: null, title: "Merkez Bankası faiz kararı günü", detail: "Para Politikası Kurulu bu gün toplanır; karar piyasayı oynatabilir.", source_url: "https://www.tcmb.gov.tr/", approximate: false });
      }
      events.sort((a, b) => a.day.localeCompare(b.day) || (a.ticker ?? "").localeCompare(b.ticker ?? ""));
      return ok({ from, to, events, notes: [NOTE_NO_INFLATION] }, 90);
    },

    async marketStrip(): Promise<MarketStrip> {
      me();
      const now = Date.parse(ctx.now());
      const open = istanbulOpen(now);
      let next = now;
      if (!open) {
        do next += DAY_MS;
        while ([0, 6].includes(istanbulWeekday(next)));
      }
      return ok(
        {
          as_of: ctx.now(),
          market: { open, label: open ? "Borsa açık" : "Borsa kapalı", next_open_day: open ? null : ymd(next + 3 * 3_600_000) },
          index: { level: 10842.5, change_pct: 0.84, day: ymd(now - DAY_MS) },
          usd_try: { rate: 34.2118, day: ymd(now - DAY_MS), published_at: new Date(now - DAY_MS).toISOString() },
        },
        60,
      );
    },
  };
}
