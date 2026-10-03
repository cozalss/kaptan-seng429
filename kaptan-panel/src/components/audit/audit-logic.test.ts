import { baseAuditChain, tamperedChain } from "@/mocks/audit";
import {
  actionLabel,
  actorView,
  cellOf,
  entryIntegrity,
  filtersFromParams,
  filtersToSearch,
  hasFilters,
  isCriticalAction,
  pageCount,
  pageForPos,
  prettyPayload,
  provisionalPosition,
  targetPos,
  toAuditQuery,
  walkPosition,
  walkTarget,
  EMPTY_FILTERS,
} from "./audit-logic";

const P = (s: string) => new URLSearchParams(s);

describe("audit labels", () => {
  it("labels known actions in Turkish and falls back to the code", () => {
    expect(actionLabel("kill_switch.on")).toBe("Kill switch açıldı");
    expect(actionLabel("x.unknown")).toBe("x.unknown");
    expect(isCriticalAction("kill_switch.on")).toBe(true);
    expect(isCriticalAction("note.added")).toBe(false);
  });
  it("splits actors into kind, id and a readable label", () => {
    expect(actorView("user:u-risk")).toEqual({ kind: "user", id: "u-risk", label: "Zeynep (Risk Officer)" });
    expect(actorView("agent:classifier").label).toBe("Sınıflandırıcı");
    expect(actorView("agent:mystery").label).toBe("mystery");
    expect(actorView("system:kap_poller")).toEqual({ kind: "system", id: "kap_poller", label: "kap poller" });
  });
});

describe("audit URL state", () => {
  it("reads and writes filters, dropping malformed values", () => {
    const f = filtersFromParams(P("actor=user:&action=limits.&entity=1651901&from=2027-01-11&run=run-x&sayfa=3"));
    expect(f).toEqual({ actor: "user:", action: "limits.", entity: "1651901", from: "2027-01-11", run_id: "run-x", page: 3 });
    expect(filtersToSearch(f)).toBe("?actor=user%3A&action=limits.&entity=1651901&from=2027-01-11&run=run-x&sayfa=3");
    expect(filtersFromParams(P("from=yarın&sayfa=-2")).from).toBe("");
    expect(filtersFromParams(P("sayfa=abc")).page).toBe(1);
    expect(filtersToSearch(EMPTY_FILTERS)).toBe("");
    expect(hasFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasFilters(f)).toBe(true);
  });
  it("maps filters to the API query (Istanbul day start in UTC)", () => {
    const q = toAuditQuery({ ...EMPTY_FILTERS, from: "2027-01-11", run_id: "r1", page: 2 });
    expect(q).toEqual({ from: "2027-01-10T21:00:00.000Z", run_id: "r1", page: 2, page_size: 50 });
  });
  it("finds deep-link targets from ?pos, ?chain_pos or #pos-N", () => {
    expect(targetPos(P("pos=3907"))).toBe(3907);
    expect(targetPos(P("chain_pos=12"))).toBe(12);
    expect(targetPos(P(""), "#pos-44")).toBe(44);
    expect(targetPos(P("pos=0"))).toBeNull();
    expect(targetPos(P("pos=abc"), "#nope")).toBeNull();
  });
  it("computes the newest-first page holding a position", () => {
    expect(pageForPos(4812, 4812)).toBe(1);
    expect(pageForPos(4812, 4763)).toBe(1);
    expect(pageForPos(4812, 4762)).toBe(2);
    expect(pageForPos(4812, 1)).toBe(97);
    expect(pageForPos(4812, 5000)).toBeNull();
    expect(pageCount(4812)).toBe(97);
    expect(pageCount(0)).toBe(1);
  });
});

describe("entry integrity and the walk", () => {
  it("recomputes a clean entry's hash and flags a tampered one", () => {
    const chain = baseAuditChain();
    expect(entryIntegrity(chain[10]!).hashOk).toBe(true);
    const bad = tamperedChain(chain, 3907)[3906]!;
    const r = entryIntegrity(bad);
    expect(r.hashOk).toBe(false);
    expect(r.canonical).toContain("kurcalandi");
  });
  it("walks to the head when OK and stops on the first bad position", () => {
    expect(walkTarget({ ok: true, checked: 4812, first_bad_pos: null })).toBe(4812);
    expect(walkTarget({ ok: false, checked: 3906, first_bad_pos: 3907 })).toBe(3907);
    expect(walkTarget({ ok: false, checked: 5, first_bad_pos: null })).toBe(5);
    expect(walkPosition(0, 1000, 100)).toBe(1);
    expect(walkPosition(500, 1000, 100)).toBe(88);
    expect(walkPosition(2000, 1000, 100)).toBe(100);
    expect(walkPosition(10, 0, 7)).toBe(7);
    expect(provisionalPosition(0, 4812)).toBe(1);
    expect(provisionalPosition(1e9, 4812)).toBeLessThan(4812);
    expect(cellOf(1, 4812, 96)).toBe(0);
    expect(cellOf(4812, 4812, 96)).toBe(95);
    expect(cellOf(3, 0, 10)).toBe(0);
    expect(prettyPayload({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});
