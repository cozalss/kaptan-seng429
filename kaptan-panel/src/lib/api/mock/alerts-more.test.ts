import { AlertHistoryItem, PriceAlert } from "@/lib/domain/price-alerts";
import { BackupList } from "@/lib/domain/restore";
import { WeeklySummary } from "@/lib/domain/weekly";
import { isApiError } from "../types";
import { weekOf, levelFor, movePrice } from "./alerts-more";
import { MockDb } from "./db";
import { createMockApi } from "./mock-api";
import { stopAllTimers, stopLiveTicker } from "./scenarios";

function setup() {
  const db = new MockDb(null);
  return { db, api: createMockApi({ db, latencyMs: 0, live: false }) };
}

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
});

const actions = (db: MockDb) => db.auditChain().map((e) => e.action);
const refused = async (p: Promise<unknown>) => {
  const e = await p.catch((x: unknown) => x);
  return isApiError(e) ? { status: e.status, code: e.code } : null;
};

describe("mock · fiyat uyarıları", () => {
  it("makes an alert from a typed price, lists it with the price now, and removes it (audited)", async () => {
    const { db, api } = setup();
    const price = (await api.company("ORNEK")).price.last_close ?? 47.4;
    const list = await api.addPriceAlert({
      ticker: "ORNEK",
      direction: "above",
      level: Math.ceil(price * 2),
    });
    expect(PriceAlert.array().safeParse(list).success).toBe(true);
    expect(list).toHaveLength(1);
    expect(list[0]?.current_price).not.toBeNull();
    const gone = await api.removePriceAlert(list[0]?.id ?? "");
    expect(gone).toEqual([]);
    expect(actions(db)).toEqual(
      expect.arrayContaining(["price_alert.created", "price_alert.removed"]),
    );
    expect(await refused(api.removePriceAlert("999"))).toEqual({
      status: 404,
      code: "not_found",
    });
  });

  it("turns a preset into a level and refuses what cannot work", async () => {
    const { api } = setup();
    const up = await api.addPriceAlert({
      ticker: "ORNEK",
      direction: "above",
      preset_pct: 5,
    });
    expect(up[0]?.level).toBe(levelFor("above", 5, 47.4));
    expect(
      await refused(
        api.addPriceAlert({ ticker: "ORNEK", direction: "above", level: 10 }),
      ),
    ).toEqual({ status: 422, code: "already_passed" });
    expect(
      await refused(
        api.addPriceAlert({ ticker: "YOKXX", direction: "above", level: 10 }),
      ),
    ).toEqual({ status: 404, code: "not_found" });
    expect(
      await refused(
        api.addPriceAlert({
          ticker: "ORNEK",
          direction: "above",
          level: 100,
          preset_pct: 5,
        } as never),
      ),
    ).toEqual({ status: 422, code: "validation" });
  });

  it("fires once when the price is reached: stamped, audited, shown on this computer, written to the history", async () => {
    const { db, api } = setup();
    const seen: unknown[] = [];
    db.bus.subscribe(
      "desk",
      (e) => e.event === "price_alert" && seen.push(e.data),
    );
    await api.addPriceAlert({ ticker: "ORNEK", direction: "above", level: 60 });
    expect(movePrice(db, "ORNEK", 55)).toBe(0);
    expect(movePrice(db, "ORNEK", 61)).toBe(1);
    expect(movePrice(db, "ORNEK", 62)).toBe(0);
    expect(seen).toHaveLength(1);
    const [a] = await api.priceAlerts();
    expect(a?.triggered_price).toBe(61);
    expect(actions(db)).toContain("price_alert.triggered");
    const history = await api.alertHistory();
    expect(AlertHistoryItem.array().safeParse(history).success).toBe(true);
    expect(history[0]?.text).toBe("KAPtan: bir fiyat uyarın tetiklendi.");
    expect(JSON.stringify(history)).not.toMatch(/ORNEK|MİSAL/);
  });
});

describe("mock · yedek listesi ve haftalık özet", () => {
  it("lists backups newest first and never offers a restore", async () => {
    const { api } = setup();
    const l = await api.backupList();
    expect(BackupList.safeParse(l).success).toBe(true);
    expect(l.files.length).toBeGreaterThan(0);
    expect(l.steps_tr.some((s) => s.includes("geri-yukle.ps1"))).toBe(true);
  });

  it("answers the Monday to Sunday week of a day", async () => {
    const { api } = setup();
    expect(weekOf("2026-11-21")).toEqual({
      start: "2026-11-16",
      end: "2026-11-22",
      label: "16–22 Kasım 2026",
    });
    expect(weekOf("2026-12-31").label).toBe("28 Aralık – 3 Ocak 2027");
    const w = await api.weekly();
    expect(WeeklySummary.safeParse(w).success).toBe(true);
    expect(w.is_current).toBe(true);
    expect((await api.weekly("2000-01-05")).is_current).toBe(false);
    expect(await refused(api.weekly("dün"))).toEqual({
      status: 422,
      code: "validation",
    });
  });
});
