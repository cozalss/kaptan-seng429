import type {
  AlertHistoryItem,
  PriceAlert,
  PriceAlertEvent,
  PriceAlertInput,
} from "@/lib/domain/price-alerts";
import type { BackupList } from "@/lib/domain/restore";
import type { WeeklySummary } from "@/lib/domain/weekly";
import { ISSUERS } from "@/mocks/issuers";
import { ApiError, type KaptanApi } from "../types";
import type { MockDb } from "./db";
import { userActor, type MockCtx } from "./guard";
import * as sel from "./selectors";
import type { MockState } from "./state";

/**
 * The test double of price alerts, the alert history, the backup list and the weekly summary (backend
 * kaptan.api.routers.price_alerts). Same refusals and sentences as the API. Prices are the double's own fiction
 * (the issuers' price, or one a test sets with `movePrice`); nothing here is a real quote.
 */
export interface MockAlertsMore {
  alerts: PriceAlert[];
  history: AlertHistoryItem[];
  /** A test moved this share's price (ticker -> price). */
  prices: Record<string, number>;
  nextId: number;
}

export function initialAlertsMore(): MockAlertsMore {
  return { alerts: [], history: [], prices: {}, nextId: 1 };
}

export function alertsMoreOf(state: MockState): MockAlertsMore {
  const mine: Partial<MockAlertsMore> = state.alertsMore ?? {};
  return { ...initialAlertsMore(), ...mine };
}

const MAX_OPEN = 30;
const STALE_DAYS = 2;
const DAY_MS = 86_400_000;
const PRICE_TEXT = "KAPtan: bir fiyat uyarın tetiklendi.";
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

const issuerOf = (ticker: string) => ISSUERS.find((i) => i.ticker === ticker);

function priceOf(s: MockAlertsMore, ticker: string): number | null {
  return s.prices[ticker] ?? issuerOf(ticker)?.price ?? null;
}

const reached = (
  direction: PriceAlert["direction"],
  level: number,
  price: number,
) => (direction === "above" ? price >= level : price <= level);

/** Mirrors `level_for`: a preset is the price now moved by that percent. */
export function levelFor(
  direction: PriceAlert["direction"],
  pct: number,
  base: number,
): number {
  return round4((base * (direction === "above" ? 100 + pct : 100 - pct)) / 100);
}

function withCurrent(
  a: PriceAlert,
  s: MockAlertsMore,
  nowIso: string,
): PriceAlert {
  const price = priceOf(s, a.ticker);
  return {
    ...a,
    current_price: price,
    current_at: price === null ? null : nowIso,
  };
}

function listOf(s: MockAlertsMore, nowIso: string): PriceAlert[] {
  const open = s.alerts.filter((a) => a.triggered_at === null);
  const done = s.alerts.filter((a) => a.triggered_at !== null);
  return [...open, ...done].map((a) => withCurrent(a, s, nowIso));
}

/**
 * Move a share's price (tests and the browser check only). Every waiting alert that is now reached fires once:
 * stamped, audited as the system, shown on this computer through the desk stream (it names the company) and
 * written to the history as the generic phone sentence.
 */
export function movePrice(db: MockDb, ticker: string, price: number): number {
  const nowIso = db.nowIso();
  const fired: PriceAlert[] = [];
  db.update((st) => {
    const cur = alertsMoreOf(st);
    const alerts = cur.alerts.map((a) => {
      if (
        a.ticker !== ticker ||
        a.triggered_at !== null ||
        !reached(a.direction, a.level, price)
      )
        return a;
      const done = { ...a, triggered_at: nowIso, triggered_price: price };
      fired.push(done);
      return done;
    });
    const history: AlertHistoryItem[] =
      fired.length > 0
        ? [
            { at: nowIso, channel: "ntfy", ok: true, text: PRICE_TEXT },
            ...cur.history,
          ]
        : cur.history;
    return {
      ...st,
      alertsMore: {
        ...cur,
        prices: { ...cur.prices, [ticker]: price },
        alerts,
        history,
      },
    };
  });
  for (const a of fired) {
    db.audit(
      "system:price_alerts",
      "price_alert.triggered",
      "price_alert",
      a.id,
      { ticker, direction: a.direction, level: a.level, price },
    );
    const event: PriceAlertEvent = {
      id: a.id,
      ticker,
      name: a.name,
      direction: a.direction,
      level: a.level,
      price,
      at: nowIso,
    };
    db.bus.emit("desk", "price_alert", event);
  }
  return fired.length;
}

const dayOf = (iso: string) =>
  new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);
const shift = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);

/** Monday to Sunday around `day`, labelled like the backend ("16–22 Kasım 2026"). */
export function weekOf(day: string): {
  start: string;
  end: string;
  label: string;
} {
  const wd = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = shift(day, -wd);
  const end = shift(start, 6);
  const [, sm = 1, sd = 1] = start.split("-").map(Number);
  const [ey = 0, em = 1, ed = 1] = end.split("-").map(Number);
  const label =
    sm === em
      ? `${sd}–${ed} ${MONTHS[em - 1]} ${ey}`
      : `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]} ${ey}`;
  return { start, end, label };
}

const FOLDER = "D:\\KAPtan-yedek";

export const STEPS_TR = [
  "Önce kontrol et: KAPtan klasöründe PowerShell aç ve .\\geri-yukle.ps1 -Kontrol yaz. Yedek ayrı bir yerde açılır, kayıtların sağlamlığı denetlenir, hemen silinir. Bugünkü verine dokunmaz.",
  "Gerçekten dönmek için .\\geri-yukle.ps1 yaz (belirli bir yedek için: -Dosya kaptan-…dump). KAPtan kısa süreliğine durur.",
  "Bugünkü verin silinmez: kaptan_eski_ ile başlayan bir adla kenara konur. Yedekten sonra yazılanlar yedekte olmaz.",
  "Bittiğinde .\\baslat.ps1 ile KAPtan’ı yeniden başlat. Bu uygulamadan geri yükleme yapılamaz: bilerek öyle.",
];

/** The backups of the double: a nightly one for the last three nights, unless the install is brand new. */
function backups(nowIso: string, lastAt: string | null): BackupList {
  const now = Date.parse(nowIso);
  const files =
    lastAt === null
      ? []
      : [0, 1, 2].map((n) => {
          const at = new Date(Date.parse(lastAt) - n * DAY_MS).toISOString();
          const stamp = at.replace(/[-:]/g, "").slice(0, 15);
          return {
            name: `kaptan-${stamp}Z.dump`,
            at,
            size_bytes: 4_200_000 - n * 31_000,
            age_days: Math.floor((now - Date.parse(at)) / DAY_MS),
          };
        });
  const age = files[0]?.age_days ?? null;
  const stale = age === null || age >= STALE_DAYS;
  const warning =
    age === null
      ? "Henüz yedek görünmüyor. Ayarlar’dan “Şimdi yedek al”a bas."
      : stale
        ? `Son yedek ${age} gün önce alındı. Yedek servisi çalışmıyor olabilir: “Şimdi yedek al”a bas.`
        : null;
  return {
    available: true,
    folder: FOLDER,
    last_at: files[0]?.at ?? null,
    age_days: age,
    stale,
    warning_tr: warning,
    files,
    steps_tr: STEPS_TR,
  };
}

type AlertsMoreApi = Pick<
  KaptanApi,
  | "priceAlerts"
  | "addPriceAlert"
  | "removePriceAlert"
  | "alertHistory"
  | "backupList"
  | "weekly"
>;

export function createAlertsMore(ctx: MockCtx): AlertsMoreApi {
  const { db, me, ok, now } = ctx;
  const patch = (fn: (s: MockAlertsMore) => Partial<MockAlertsMore>) =>
    db.update((st) => ({
      ...st,
      alertsMore: { ...alertsMoreOf(st), ...fn(alertsMoreOf(st)) },
    }));
  const list = () => listOf(alertsMoreOf(db.snapshot), now());

  return {
    async priceAlerts() {
      me();
      return ok(list(), 80);
    },

    async addPriceAlert(input: PriceAlertInput) {
      const a = me();
      const s = alertsMoreOf(db.snapshot);
      const issuer = issuerOf(input.ticker);
      if (!issuer)
        throw new ApiError(404, "not_found", "Bu kodla bir şirket bulamadım.");
      if (s.alerts.filter((x) => x.triggered_at === null).length >= MAX_OPEN)
        throw new ApiError(
          409,
          "alerts_full",
          `En fazla ${MAX_OPEN} açık fiyat uyarın olabilir. Birini kaldır.`,
        );
      const base = priceOf(s, input.ticker);
      const preset = "preset_pct" in input ? input.preset_pct : null;
      const typed = "level" in input ? input.level : null;
      if ((preset === null) === (typed === null))
        throw new ApiError(
          422,
          "validation",
          "Bir fiyat yaz ya da yüzde 5 / yüzde 10 seç.",
        );
      if (typed !== null && (!(typed > 0) || typed >= 1_000_000))
        throw new ApiError(422, "validation", "Geçerli bir fiyat yaz.");
      if (preset !== null && base === null)
        throw new ApiError(
          409,
          "no_price",
          "Bu hisse için henüz bir fiyatım yok; yüzdeyle uyarı kuramıyorum. Bir fiyat yazarak dene.",
        );
      const level =
        preset !== null
          ? levelFor(input.direction, preset, base ?? 0)
          : round4(typed ?? 0);
      if (
        typed !== null &&
        base !== null &&
        reached(input.direction, level, base)
      ) {
        throw new ApiError(
          422,
          "already_passed",
          "Hisse bu fiyata şimdiden gelmiş. Uyarı hemen tetiklenirdi; farklı bir fiyat yaz.",
        );
      }
      const id = String(s.nextId);
      const made: PriceAlert = {
        id,
        ticker: input.ticker,
        name: issuer.name,
        direction: input.direction,
        level,
        preset_pct: preset,
        created_at: now(),
        triggered_at: null,
        triggered_price: null,
        current_price: null,
        current_at: null,
      };
      patch((cur) => ({
        alerts: [...cur.alerts, made],
        nextId: cur.nextId + 1,
      }));
      db.audit(userActor(a), "price_alert.created", "price_alert", id, {
        ticker: input.ticker,
        direction: input.direction,
        level,
        preset_pct: preset,
      });
      return ok(list(), 120);
    },

    async removePriceAlert(id) {
      const a = me();
      const found = alertsMoreOf(db.snapshot).alerts.find((x) => x.id === id);
      if (!found) throw new ApiError(404, "not_found", "Bu uyarıyı bulamadım.");
      patch((cur) => ({ alerts: cur.alerts.filter((x) => x.id !== id) }));
      db.audit(userActor(a), "price_alert.removed", "price_alert", id, {
        ticker: found.ticker,
      });
      return ok(list(), 100);
    },

    async alertHistory() {
      me();
      return ok(alertsMoreOf(db.snapshot).history, 80);
    },

    async backupList() {
      me();
      const { comfort } = db.snapshot;
      return ok(
        backups(
          now(),
          comfort?.backupLastAt ??
            new Date(Date.parse(now()) - DAY_MS).toISOString(),
        ),
        80,
      );
    },

    async weekly(at) {
      me();
      if (at !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(at))
        throw new ApiError(422, "validation", "Tarih bekleniyor (YYYY-MM-DD)");
      const today = dayOf(now());
      const w = weekOf(at ?? today);
      const current = w.start <= today && today <= w.end;
      const book = sel.bookOf(db.snapshot);
      const cards = sel
        .approvalCards(db.snapshot)
        .filter((c) => !c.run_id.startsWith("run-hist"));
      const inWeek = current ? cards : [];
      const history = alertsMoreOf(db.snapshot).history.filter(
        (h) => h.ok && dayOf(h.at) >= w.start && dayOf(h.at) <= w.end,
      );
      return ok<WeeklySummary>(
        {
          start: w.start,
          end: w.end,
          label_tr: w.label,
          is_current: current,
          started: book.started,
          put_in_net: current ? book.put_in : 0,
          value_start: current ? 0 : null,
          value_end: current ? book.equity : null,
          gain_try: current ? book.equity - book.put_in : null,
          dividends_try: null,
          read: current ? sel.counters(db.snapshot).total : 0,
          suggestions: {
            made: inWeek.length,
            took: 0,
            skipped: 0,
            declined: inWeek.filter((c) => c.status === "rejected").length,
            expired: 0,
            waiting: inWeek.filter((c) => c.status === "pending").length,
          },
          benchmark: {
            start: null,
            end: null,
            available: false,
            you_ratio: null,
            index_ratio: null,
            sentence_tr: null,
            reason_tr: "BIST 100 fiyatı bu günler için kayıtlı değil.",
          },
          alerts_sent: history.length,
          notes_tr: current
            ? ["Bu hafta henüz bitmedi; rakamlar bugüne kadar."]
            : [],
        },
        140,
      );
    },
  };
}
