import { decisionClock } from "./decision-clock";

const NOW = Date.parse("2027-01-11T10:40:00.000Z"); // 13:40 in Istanbul
const card = (created: string, expires: string) => ({ created_at: created, expires_at: expires });

describe("karar saati", () => {
  it("reads the soonest deadline, how long is left and how much of the window remains", () => {
    const clock = decisionClock(
      [card("2027-01-11T08:00:00.000Z", "2027-01-12T06:50:00.000Z"), card("2027-01-11T06:40:00.000Z", "2027-01-12T06:50:00.000Z")],
      NOW,
    );
    expect(clock?.when).toBe("yarın 09:50");
    expect(clock?.left).toBe("20 saat 10 dakika kaldı");
    expect(clock?.remaining).toBeGreaterThan(0.8);
    expect(clock?.remaining).toBeLessThan(1);
  });

  it("is empty with nothing open or before the clock is known", () => {
    expect(decisionClock([], NOW)).toBeNull();
    expect(decisionClock([card("2027-01-11T08:00:00.000Z", "2027-01-12T06:50:00.000Z")], null)).toBeNull();
  });

  it("says when the time is up and never leaves the 0…1 range", () => {
    const late = decisionClock([card("2027-01-10T08:00:00.000Z", "2027-01-11T06:50:00.000Z")], NOW);
    expect(late?.left).toBe("süresi doldu");
    expect(late?.remaining).toBe(0);
  });
});
