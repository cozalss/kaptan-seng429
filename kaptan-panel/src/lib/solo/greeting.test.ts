import { greeting, marketOpen } from "./greeting";

const at = (iso: string) => Date.parse(iso);

describe("the personal home's greeting line", () => {
  it("greets by the Istanbul clock", () => {
    expect(greeting(at("2027-01-11T06:00:00Z"))).toBe("Günaydın"); // 09:00
    expect(greeting(at("2027-01-11T11:00:00Z"))).toBe("İyi günler"); // 14:00
    expect(greeting(at("2027-01-11T17:00:00Z"))).toBe("İyi akşamlar"); // 20:00
    expect(greeting(at("2027-01-11T22:00:00Z"))).toBe("İyi geceler"); // 01:00
  });

  it("knows when the market is open", () => {
    expect(marketOpen(at("2027-01-11T08:00:00Z"))).toBe(true); // Monday 11:00
    expect(marketOpen(at("2027-01-11T06:30:00Z"))).toBe(false); // 09:30
    expect(marketOpen(at("2027-01-11T15:00:00Z"))).toBe(false); // 18:00
    expect(marketOpen(at("2027-01-09T08:00:00Z"))).toBe(false); // Saturday
  });
});
