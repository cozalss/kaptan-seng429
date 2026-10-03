import { CREW, crewByAgent, crewBySlug, MODEL_CHAIN, portraitSrc, portraitSrcSet, PROVIDER_LABEL } from "@/lib/crew";
import { actorName } from "@/lib/actors";
import { LIMITS_V1, limitViolations, type LimitValue } from "@/lib/domain";
import { nthSessionCloseAfter, personalReset, RESET_SESSIONS_REQUIRED, sessionsClosedSince } from "@/lib/personal-reset";
import { effectiveEntry, EMPTY_ENTRY, ticketNumber, ticketValidUntil, TICKET_TTL_MS } from "@/mocks/tickets";

describe("crew registry", () => {
  it("has the eight landing members in pipeline order with unique slugs and portraits", () => {
    expect(CREW.map((m) => m.number)).toEqual(["01", "02", "03", "04", "05", "06", "07", "08"]);
    expect(new Set(CREW.map((m) => m.id)).size).toBe(8);
    expect(CREW.filter((m) => m.kind === "rule").map((m) => m.agent)).toEqual(["rule_engine", "risk_gate"]);
    expect(Object.isFrozen(CREW)).toBe(true);
  });
  it("finds members by slug and agent", () => {
    expect(crewBySlug("supheci")?.agent).toBe("skeptic");
    expect(crewBySlug("yok")).toBeNull();
    expect(crewByAgent("risk_gate").name).toBe("Risk Kapısı");
    expect(() => crewByAgent("yok" as never)).toThrow(RangeError);
  });
  it("builds portrait sources for every width and format", () => {
    const m = CREW[0]!;
    expect(portraitSrcSet(m, "avif")).toBe("/crew/ajan-1-400.avif 400w, /crew/ajan-1-600.avif 600w, /crew/ajan-1-800.avif 800w");
    expect(portraitSrc(m)).toBe("/crew/ajan-1-400.jpg");
    expect(portraitSrc(m, 800)).toBe("/crew/ajan-1-800.jpg");
  });
  it("ends every model chain in HOLD and labels every provider", () => {
    for (const chain of Object.values(MODEL_CHAIN)) {
      expect(chain.at(-1)).toBe("HOLD");
      for (const p of chain) expect(PROVIDER_LABEL[p]).toBeTruthy();
    }
    expect(MODEL_CHAIN.skeptic[0]).toBe("Groq");
  });
});

describe("actorName", () => {
  it("names you, the agents and the system", () => {
    expect(actorName(null)).toBe("—");
    expect(actorName("sen")).toBe("Sen");
    expect(actorName("user:sen")).toBe("Sen");
    expect(actorName("agent:compliance")).toBe("Uyum");
    expect(actorName("system:risk_monitor")).toBe("Otomatik (risk izleyici)");
    expect(actorName("system:simbist")).toBe("Sistem (simbist)");
    expect(actorName("başka")).toBe("başka");
  });
});

describe("limitViolations (tighten only)", () => {
  const withValue = (key: LimitValue["key"], value: number) => LIMITS_V1.map((v) => (v.key === key ? { key, value } : v));
  it("accepts the canonical set and any tighter value", () => {
    expect(limitViolations(LIMITS_V1)).toEqual([]);
    expect(limitViolations(withValue("max_position_pct", 0.05))).toEqual([]);
    expect(limitViolations(withValue("daily_loss_halt_pct", -0.005))).toEqual([]);
    expect(limitViolations(withValue("min_edge_cost_ratio", 3))).toEqual([]);
  });
  it("refuses looser, sign-flipped, fractional or missing values", () => {
    expect(limitViolations(withValue("max_position_pct", 0.2))[0]).toMatch(/gevşek/);
    expect(limitViolations(withValue("kill_drawdown_pct", -0.1))[0]).toMatch(/gevşek/);
    expect(limitViolations(withValue("daily_loss_halt_pct", 0.01)).join(" ")).toMatch(/işareti/);
    expect(limitViolations(withValue("max_concurrent_positions", 2.5)).join(" ")).toMatch(/tam sayı/);
    expect(limitViolations(LIMITS_V1.filter((v) => v.key !== "price_band_pct"))[0]).toMatch(/eksik/);
  });
  it("keeps the target at or below the maximum", () => {
    const vals = withValue("max_concurrent_positions", 5);
    expect(limitViolations(vals).join(" ")).toMatch(/Hedef eşzamanlı/);
  });
});

describe("personal reset rule", () => {
  const KILL = "2027-01-11T10:40:00.000Z"; // Monday 13:40 Istanbul
  it("counts sessions closed after the trigger day, skipping weekends", () => {
    expect(nthSessionCloseAfter(KILL, 1)).toBe("2027-01-12T15:10:00.000Z");
    expect(nthSessionCloseAfter(KILL, 5)).toBe("2027-01-18T15:10:00.000Z");
    expect(sessionsClosedSince(KILL, "2027-01-11T16:00:00.000Z")).toBe(0);
    expect(sessionsClosedSince(KILL, "2027-01-16T12:00:00.000Z")).toBe(4);
    expect(sessionsClosedSince(KILL, "2027-02-20T12:00:00.000Z", 5)).toBe(5);
  });
  it("walks first → wait → second", () => {
    expect(personalReset(KILL, null, KILL)).toMatchObject({ next_step: "first", ready_at: null, sessions_required: RESET_SESSIONS_REQUIRED });
    const first = { at: "2027-01-18T16:00:00.000Z", reason: "İnceleme tamam" };
    // Sessions are done, but the 24 h gap is not.
    const wait = personalReset(KILL, first, "2027-01-19T10:00:00.000Z");
    expect(wait).toMatchObject({ next_step: "wait", second_allowed_at: "2027-01-19T16:00:00.000Z", ready_at: "2027-01-19T16:00:00.000Z" });
    expect(personalReset(KILL, first, "2027-01-19T16:00:00.000Z").next_step).toBe("second");
  });
});

describe("order tickets", () => {
  it("is valid for 30 minutes, from 09:40 before the open, capped at 18:00", () => {
    expect(ticketValidUntil("2027-01-11T10:40:20.000Z")).toBe(new Date(Date.parse("2027-01-11T10:40:20.000Z") + TICKET_TTL_MS).toISOString());
    expect(ticketValidUntil("2027-01-11T05:00:00.000Z")).toBe("2027-01-11T07:10:00.000Z");
    expect(ticketValidUntil("2027-01-11T14:50:00.000Z")).toBe("2027-01-11T15:00:00.000Z");
    expect(ticketValidUntil("2027-01-15T15:30:00.000Z")).toBe("2027-01-18T07:10:00.000Z");
  });
  it("numbers tickets by Istanbul date and sequence", () => {
    expect(ticketNumber("2027-01-11T10:40:20.000Z", 3)).toBe("T-2027-0111-003");
    expect(ticketNumber("2027-01-11T22:00:00.000Z", 12)).toBe("T-2027-0112-012");
  });
  it("reads an unmarked ticket past its TTL as expired, but keeps a mark", () => {
    const t = { valid_until: "2027-01-11T11:10:00.000Z" };
    expect(effectiveEntry(t, undefined, Date.parse("2027-01-11T11:00:00Z"))).toBe(EMPTY_ENTRY);
    expect(effectiveEntry(t, undefined, Date.parse("2027-01-11T11:10:00Z")).status).toBe("expired");
    const mark = { ...EMPTY_ENTRY, status: "canceled" as const };
    expect(effectiveEntry(t, mark, Date.parse("2027-01-12T00:00:00Z"))).toBe(mark);
  });
});
