import type { DisclosureListItem } from "@/lib/domain";
import type { ReadingState, TriageStateName } from "@/lib/domain/reading";
import { ApiError, type KaptanApi } from "../types";
import type { MockCtx } from "./guard";
import { signalOf } from "./digest";
import { createSignals } from "./signals";
import * as sel from "./selectors";

/**
 * The test double of the reading marks (backend kaptan.api.routers.reading): saved disclosures, the unread
 * counter for starred or held companies and the first day both of two prices are stored. Like the API it
 * writes no audit record: these are bookmarks, not money.
 */
export interface MockReading {
  /** ISO time; null = the start of the double's own day. */
  readThrough: string | null;
  opened: number[];
  /** Legacy "sonra oku" stars; the triage state "sonra" is the same thing. */
  saved: number[];
  /** Where the person put important disclosures: act / read later / done. */
  triage?: Record<string, TriageStateName>;
}

export function initialReading(): MockReading {
  return { readThrough: null, opened: [], saved: [] };
}

const MAX_UNREAD = 500;

export function createReading(ctx: MockCtx): Pick<KaptanApi, "readingState" | "readAll" | "restoreReadThrough" | "markRead" | "setSaved" | "savedDisclosures" | "setTriage" | "signals" | "signal"> {
  const { db, me, ok } = ctx;
  const mark = (): MockReading => db.snapshot.reading ?? initialReading();
  const write = (next: MockReading) => db.update((s) => ({ ...s, reading: next }));
  const exists = (index: number) => sel.visibleDisclosures(db.snapshot).some((d) => d.disclosure_index === index);

  const triageMap = (): Record<string, TriageStateName> => ({
    ...Object.fromEntries(mark().saved.map((i) => [String(i), "sonra" as const])),
    ...(mark().triage ?? {}),
  });
  const handled = (i: number, m: MockReading) => m.opened.includes(i) || String(i) in triageMap();

  const state = (): ReadingState => {
    const m = mark();
    const through = m.readThrough ?? `${ctx.now().slice(0, 10)}T00:00:00.000Z`;
    const held = new Set(sel.positions(db.snapshot).map((p) => p.ticker));
    const watched = new Set(db.snapshot.watchlist);
    const cards = new Map(sel.approvalCards(db.snapshot).map((c) => [c.disclosure_index, c] as const));
    // Unread = IMPORTANT (the digest's meaning) and mine; important ones of other companies are counted apart.
    const important = sel
      .visibleDisclosures(db.snapshot)
      .filter((d) => d.published_at > through && !handled(d.disclosure_index, m))
      .flatMap((d) => {
        const sig = signalOf(d, held, watched, cards);
        return sig ? [sig] : [];
      });
    const mine = important.filter((s) => s.mine !== null).map((s) => s.disclosure_index);
    const triage = Object.entries(triageMap()).map(([i, st]) => ({ disclosure_index: Number(i), state: st }));
    return {
      read_through: through,
      unread: mine.length,
      unread_other: important.length - mine.length,
      unread_indexes: mine.slice(0, MAX_UNREAD),
      saved_indexes: triage.filter((t) => t.state === "sonra").map((t) => t.disclosure_index),
      triage,
      act_count: triage.filter((t) => t.state === "yapilacak").length,
    };
  };
  const signals = createSignals(ctx, () => triageMap());

  return {
    ...signals,
    async setTriage(index, next) {
      me();
      if (next !== null && !exists(index)) throw new ApiError(404, "not_found", "Bu bildirimi bulamadım.");
      const m = mark();
      const triage = { ...(m.triage ?? {}) };
      delete triage[String(index)];
      if (next !== null) triage[String(index)] = next;
      const opened = next !== null && !m.opened.includes(index) ? [...m.opened, index] : m.opened;
      write({ ...m, saved: m.saved.filter((i) => i !== index), triage, opened });
      return ok(state(), 40);
    },
    async readingState() {
      me();
      return ok(state(), 60);
    },
    async readAll(important) {
      me();
      if (!important) return ok(state(), 60); // noise and archive-only are read from the start: nothing that counts
      // Like the API: opened marks under the previous mark are no longer needed; the newer ones stay, so an
      // undo never brings back what was already opened.
      const m = mark();
      const before = state().read_through;
      const published = new Map(sel.visibleDisclosures(db.snapshot).map((d) => [d.disclosure_index, d.published_at]));
      const opened = m.opened.filter((i) => (published.get(i) ?? "") > before);
      write({ ...m, readThrough: ctx.now(), opened });
      return ok(state(), 60);
    },
    async restoreReadThrough(through) {
      me();
      if (through > ctx.now()) throw new ApiError(422, "validation", "Bu an henüz gelmedi.");
      const current = state().read_through;
      write({ ...mark(), readThrough: through < current ? through : current });
      return ok(state(), 40);
    },
    async markRead(index) {
      me();
      if (!exists(index)) throw new ApiError(404, "not_found", "Bu bildirimi bulamadım.");
      const m = mark();
      if (!m.opened.includes(index)) write({ ...m, opened: [...m.opened, index] });
      return ok(state(), 40);
    },
    async setSaved(index, saved) {
      me();
      if (saved) return this.setTriage(index, "sonra");
      if (triageMap()[String(index)] === "sonra") return this.setTriage(index, null);
      return ok(state(), 40);
    },
    async savedDisclosures() {
      me();
      const all = sel.visibleDisclosures(db.snapshot);
      const rows = state().saved_indexes.flatMap((i) => all.filter((d) => d.disclosure_index === i));
      return ok<DisclosureListItem[]>(rows, 80);
    },
  };
}
