import type { Benchmark, Karne, KarnePeriod, MorningBrief, QuietDay, TrackItem, TrackRecord, TrackSummary } from "@/lib/domain";
import { fmtInt, fmtPct, fmtSignedPct } from "@/lib/format";
import { addDays, isTradingDay } from "@/lib/time";
import type { KaptanApi } from "../types";
import type { MockCtx } from "./guard";
import * as sel from "./selectors";

/**
 * The report endpoints in the test double: the same shapes, words and honesty as the backend
 * (backend/src/kaptan/reports). Four finished suggestions from earlier weeks (so the "too few to
 * say" caveat shows) plus the day's real cards, whose period is still open.
 */
type Reports = Pick<KaptanApi, "trackRecord" | "benchmark" | "karne" | "quietDay" | "briefToday">;

const FLAT = 0.0005;
const ENOUGH = 30;
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const LOCATIVE = ["ta", "ta", "ta", "da", "ta", "da", "da", "ta", "de", "de", "da", "ta"];
const DECISION_TR: Record<TrackItem["decision"], string> = {
  took: "Aldın",
  approved_open: "Onayladın; bankada almanı bekliyor",
  not_bought: "Onayladın ama almadın",
  declined: "Reddettin",
  skipped: "Geçtin",
  expired: "Süresi doldu, karar vermedin",
  waiting: "Kararını bekliyor",
  cancelled: "İptal oldu",
};

const dayTr = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const locative = (iso: string) => `${dayTr(iso)}'${LOCATIVE[Number(iso.slice(5, 7)) - 1]}`;
const istDay = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);

interface Past {
  id: string;
  ticker: string;
  company: string;
  ago: number;
  decision: TrackItem["decision"];
  ret: number;
  index: number;
}
const PAST: readonly Past[] = [
  { id: "gec-1", ticker: "THYAO", company: "Türk Hava Yolları", ago: 34, decision: "took", ret: 0.042, index: 0.011 },
  { id: "gec-2", ticker: "EREGL", company: "Ereğli Demir Çelik", ago: 28, decision: "skipped", ret: -0.018, index: 0.006 },
  { id: "gec-3", ticker: "ASELS", company: "Aselsan", ago: 23, decision: "took", ret: 0.007, index: -0.004 },
  { id: "gec-4", ticker: "KRDMD", company: "Kardemir", ago: 19, decision: "declined", ret: 0.031, index: 0.012 },
];

function pastItem(p: Past, today: string): TrackItem {
  const day = addDays(today, -p.ago);
  const result = addDays(day, 8);
  return {
    proposal_id: `prop-${p.id}`,
    ticker: p.ticker,
    company_name: p.company,
    suggested_at: `${day}T07:30:00.000Z`,
    decision: p.decision,
    decision_tr: DECISION_TR[p.decision],
    entry_day: addDays(day, 1),
    result_day: result,
    planned_sessions: 6,
    status: "done",
    return_ratio: p.ret,
    index_ratio: p.index,
    result_tr: `${dayTr(addDays(day, 1))} – ${dayTr(result)} arasında ${fmtSignedPct(p.ret, 1)} (aynı günlerde BIST 100 ${fmtSignedPct(p.index, 1)})`,
  };
}

function decisionOf(status: string, entered: boolean): TrackItem["decision"] {
  if (status === "approved") return entered ? "took" : "approved_open";
  if (status === "rejected") return "declined";
  if (status === "expired") return "expired";
  if (status === "cancelled") return "cancelled";
  return "waiting";
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const group = (items: TrackItem[]) => ({ n: items.length, avg_ratio: avg(items.map((i) => i.return_ratio ?? 0)) });
const sg = (r: number | null) => (r === null ? "" : fmtSignedPct(r, 1));

/** TrackSummary of items, in the backend's sentences. */
export function summarizeTrack(items: readonly TrackItem[]): TrackSummary {
  const done = items.filter((i) => i.status === "done" && i.return_ratio !== null);
  const ratios = done.map((i) => i.return_ratio as number);
  const up = ratios.filter((r) => r >= FLAT).length;
  const down = ratios.filter((r) => r <= -FLAT).length;
  const mean = avg(ratios);
  const took = group(done.filter((i) => i.decision === "took"));
  const left = group(done.filter((i) => ["skipped", "declined", "expired", "not_bought"].includes(i.decision)));
  const all = group(done);
  const sorted = [...done].sort((a, b) => (a.return_ratio as number) - (b.return_ratio as number));
  const pick = (i: TrackItem | undefined) => (i ? { ticker: i.ticker, company_name: i.company_name, ratio: i.return_ratio as number } : null);
  const flat = done.length - up - down;
  let headline = items.length > 0 ? `KAPtan ${fmtInt(items.length)} öneri verdi; hiçbirinin süresi henüz dolmadı.` : "KAPtan henüz sana öneri vermedi.";
  if (done.length > 0 && mean !== null) {
    const parts = [`${fmtInt(up)} arttı`, `${fmtInt(down)} azaldı`, ...(flat ? [`${fmtInt(flat)} değişmedi`] : [])];
    headline = `Süresi dolan ${fmtInt(done.length)} öneriden ${parts.join(", ")}. Ortalama sonuç ${sg(mean)}.`;
  }
  const small = done.length < ENOUGH ? `Henüz ${fmtInt(done.length)} öneri sonuçlandı; bu kadar azla bir şey söylemek erken. ` : "";
  let compare: string | null = null;
  if (all.n > 0 && all.avg_ratio !== null) {
    const rest = left.n ? ` Almadığın ${fmtInt(left.n)} öneri ortalama ${sg(left.avg_ratio)} oldu.` : "";
    compare =
      took.n === 0
        ? "Henüz hiçbir öneriyi almadın; bu yüzden senin yaptığınla karşılaştırılacak bir şey yok."
        : `Her öneriyi izleseydin ortalama ${sg(all.avg_ratio)} olurdu; senin aldığın ${fmtInt(took.n)} öneri ortalama ${sg(took.avg_ratio)} oldu.${rest}`;
  }
  return {
    count: items.length,
    done: done.length,
    open: items.filter((i) => i.status === "open").length,
    no_data: items.filter((i) => i.status === "no_data").length,
    up,
    down,
    flat,
    avg_ratio: mean,
    index_avg_ratio: avg(done.flatMap((i) => (i.index_ratio === null ? [] : [i.index_ratio]))),
    best: pick(sorted[sorted.length - 1]),
    worst: pick(sorted[0]),
    followed_all: all,
    you_took: took,
    you_skipped: left,
    headline_tr: headline,
    caveat_tr: done.length === 0 ? null : `${small}Hesapta komisyon yok; her öneriye aynı tutar verilmiş gibi ortalama alındı.`,
    compare_tr: compare,
  };
}

const NO_INDEX = (reason: string): Benchmark => ({ start: null, end: null, available: false, you_ratio: null, index_ratio: null, sentence_tr: null, reason_tr: reason });

export function createReports(ctx: MockCtx): Reports {
  const { db, ok, now } = ctx;

  const items = (): TrackItem[] => {
    const today = istDay(now());
    const entered = Object.values(db.snapshot.ticketMarks).some((m) => m.status === "entered");
    const live = sel
      .approvalCards(db.snapshot)
      .filter((c) => !c.run_id.startsWith("run-hist") && c.side === "buy")
      .map((c): TrackItem => {
        const decision = decisionOf(c.status, entered);
        const result = addDays(today, 8);
        return {
          proposal_id: c.proposal_id,
          ticker: c.ticker,
          company_name: c.company_name,
          suggested_at: c.created_at,
          decision,
          decision_tr: DECISION_TR[decision],
          entry_day: isTradingDay(addDays(today, 1)) ? addDays(today, 1) : addDays(today, 3),
          result_day: result,
          planned_sessions: 6,
          status: "open",
          return_ratio: null,
          index_ratio: null,
          result_tr: `Sonuç ${locative(result)} belli olur`,
        };
      });
    return [...PAST.map((p) => pastItem(p, today)), ...live];
  };

  const benchmark = (): Benchmark => {
    const end = istDay(now());
    const start = addDays(end, -20);
    return {
      start,
      end,
      available: true,
      you_ratio: 0.0166,
      index_ratio: 0.032,
      sentence_tr: `${dayTr(start)} – ${dayTr(end)} arasında paran ${fmtPct(0.0166, 1)} arttı; aynı sürede BIST 100 ${fmtPct(0.032, 1)} arttı.`,
      reason_tr: null,
    };
  };

  return {
    async trackRecord() {
      ctx.me();
      const all = items();
      return ok<TrackRecord>({ as_of: now(), items: all, summary: summarizeTrack(all) }, 120);
    },

    async benchmark() {
      ctx.me();
      return ok(db.snapshot.book.seeded ? benchmark() : NO_INDEX("Karşılaştırmak için henüz en az iki borsa günü kapanışı yok."), 100);
    },

    async karne(period: KarnePeriod = "month", at?: string) {
      ctx.me();
      const today = istDay(now());
      const key = at ?? (period === "year" ? today.slice(0, 4) : today.slice(0, 7));
      const [y = 0, m = 1] = key.split("-").map(Number);
      const start = period === "year" ? `${y}-01-01` : `${y}-${String(m).padStart(2, "0")}-01`;
      const end = period === "year" ? `${y}-12-31` : new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      const current = start <= today && today <= end;
      const book = sel.bookOf(db.snapshot);
      const all = items().filter((i) => istDay(i.suggested_at) >= start && istDay(i.suggested_at) <= end);
      const count = (...k: TrackItem["decision"][]) => all.filter((i) => k.includes(i.decision)).length;
      return ok<Karne>(
        {
          period,
          label_tr: period === "year" ? String(y) : `${MONTHS[m - 1]} ${y}`,
          start,
          end,
          is_current: current,
          started: book.started,
          put_in_net: current ? book.put_in : 0,
          value_start: current ? 0 : null,
          value_end: current ? book.equity : null,
          gain_try: current ? book.equity - book.put_in : null,
          realized_try: 0,
          unrealized_try: current ? book.positions.reduce((s, p) => s + (p.last_price - p.avg_cost) * p.qty, 0) : null,
          commissions_try: 0,
          dividends_try: null,
          suggestions: { made: all.length, took: count("took"), skipped: count("skipped"), declined: count("declined"), expired: count("expired"), waiting: count("waiting", "approved_open") },
          decisions: count("took", "approved_open", "not_bought", "declined", "skipped"),
          track: summarizeTrack(all),
          benchmark: current ? benchmark() : NO_INDEX("BIST 100 fiyatı bu günler için kayıtlı değil."),
          notes_tr: current ? ["Bu dönem henüz bitmedi; rakamlar bugüne kadar."] : [],
        },
        140,
      );
    },

    async quietDay() {
      ctx.me();
      const c = sel.counters(db.snapshot);
      const relevant = c.processed;
      const head = `Bugün ${fmtInt(c.total)} bildirim okundu`;
      const reason = "olay KAPtan'ın aradığı ölçülere uymadı";
      let sentence = `${head}; ${fmtInt(c.proposals)} öneri çıktı.`;
      if (c.proposals === 0) {
        sentence = relevant === 0 ? `${head}; hiçbiri senin için ilgili değildi.` : `${head}; ${fmtInt(relevant)} tanesi ilgiliydi, hiçbiri kurallardan geçmedi. En sık neden: ${reason}.`;
      }
      const reasons = c.proposals === 0 && relevant > 0 ? [{ reason_tr: reason, n: relevant }] : [];
      return ok<QuietDay>({ day: istDay(now()), read: c.total, relevant, proposals: c.proposals, sentence_tr: sentence, reasons }, 80);
    },

    async briefToday() {
      ctx.me();
      const book = sel.bookOf(db.snapshot);
      if (!book.started) return ok(null, 60);
      const pending = sel.approvalCards(db.snapshot).filter((c) => c.status === "pending" && !c.run_id.startsWith("run-hist")).length;
      const brief: MorningBrief = {
        date: istDay(now()),
        generated_at: now(),
        important_disclosures: [],
        orders_for_open: [],
        pending_approvals: [],
        open_positions: [],
        expiring_today: [],
        risk_warnings: [],
        restriction_changes: [],
        summary_tr: `${pending > 0 ? `Onayını bekleyen ${fmtInt(pending)} öneri var.` : "Onayını bekleyen öneri yok."} ${book.positions.length ? `Elinde ${fmtInt(book.positions.length)} hisse var.` : "Elinde KAPtan'ın bildiği hisse yok."}`,
        is_sample: false,
      };
      return ok(brief, 60);
    },
  };
}
