import { dayLabel, istanbulDay, sessionView } from "./session-day";

const at = (iso: string) => Date.parse(iso);

describe("which day Bugün talks about", () => {
  it("shows Friday's session on a Saturday", () => {
    const v = sessionView(at("2026-10-31T09:00:00Z"), 6);
    expect(v).toEqual({ today: "2026-10-31", shown: "2026-10-30", previous: true, closed: true, next: "2026-11-02" });
  });

  it("uses the Istanbul day, not the UTC one, just after midnight", () => {
    expect(istanbulDay(at("2026-10-30T21:30:00Z"))).toBe("2026-10-31");
  });

  it("stays on today once a session day is under way", () => {
    expect(sessionView(at("2026-11-02T09:30:00Z"), 4).shown).toBe("2026-11-02");
    expect(sessionView(at("2026-11-02T06:00:00Z"), 40).previous).toBe(false);
  });

  it("falls back to the last session early on a session day with almost nothing read", () => {
    const v = sessionView(at("2026-11-02T05:00:00Z"), 3);
    expect(v.shown).toBe("2026-10-30");
    expect(v.closed).toBe(false);
  });

  it("skips the holiday on the way back", () => {
    expect(sessionView(at("2026-10-30T05:00:00Z"), 0).shown).toBe("2026-10-28");
  });

  it("names a day the way a person says it", () => {
    expect(dayLabel("2026-10-30")).toBe("30 Ekim Cuma");
  });
});
