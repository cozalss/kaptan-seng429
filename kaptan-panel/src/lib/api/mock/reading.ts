import type { DisclosureListItem } from "@/lib/domain";
import type { ReadingState } from "@/lib/domain/reading";
import { ApiError, type KaptanApi } from "../types";
import type { MockCtx } from "./guard";
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
  saved: number[];
}

export function initialReading(): MockReading {
  return { readThrough: null, opened: [], saved: [] };
}

const MAX_UNREAD = 500;

export function createReading(ctx: MockCtx): Pick<KaptanApi, "readingState" | "readAll" | "restoreReadThrough" | "markRead" | "setSaved" | "savedDisclosures"> {
  const { db, me, ok } = ctx;
  const mark = (): MockReading => db.snapshot.reading ?? initialReading();
  const write = (next: MockReading) => db.update((s) => ({ ...s, reading: next }));
  const exists = (index: number) => sel.visibleDisclosures(db.snapshot).some((d) => d.disclosure_index === index);

  const state = (): ReadingState => {
    const m = mark();
    const through = m.readThrough ?? `${ctx.now().slice(0, 10)}T00:00:00.000Z`;
    const mine = new Set([...db.snapshot.watchlist, ...sel.positions(db.snapshot).map((p) => p.ticker)]);
    const unread = sel
      .visibleDisclosures(db.snapshot)
      .filter((d) => !d.is_noise && d.published_at > through && !m.opened.includes(d.disclosure_index) && d.stock_codes.some((c) => mine.has(c)))
      .map((d) => d.disclosure_index);
    return { read_through: through, unread: unread.length, unread_indexes: unread.slice(0, MAX_UNREAD), saved_indexes: m.saved };
  };

  return {
    async readingState() {
      me();
      return ok(state(), 60);
    },
    async readAll() {
      me();
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
      const m = mark();
      if (saved) {
        if (!exists(index)) throw new ApiError(404, "not_found", "Bu bildirimi bulamadım.");
        if (!m.saved.includes(index)) write({ ...m, saved: [index, ...m.saved] });
      } else {
        write({ ...m, saved: m.saved.filter((i) => i !== index) });
      }
      return ok(state(), 40);
    },
    async savedDisclosures() {
      me();
      const all = sel.visibleDisclosures(db.snapshot);
      const rows = mark().saved.flatMap((i) => all.filter((d) => d.disclosure_index === i));
      return ok<DisclosureListItem[]>(rows, 80);
    },
  };
}
