import { describe, expect, it } from "vitest";
import { defaultAlertPrefs } from "./alert-defaults";
import { desktopAllowed, inQuiet } from "./quiet";
import { pauseEndWords, tomorrowIso } from "./words";

// 23:00 Istanbul (UTC+3) is 20:00 UTC; 12:00 Istanbul is 09:00 UTC.
const NIGHT = Date.parse("2026-11-20T20:00:00Z");
const NOON = Date.parse("2026-11-21T09:00:00Z");
const quiet = (on = true, start = "22:00", end = "08:00") => ({
  on,
  start,
  end,
});

describe("quiet hours", () => {
  it("cross midnight on the Istanbul clock", () => {
    expect(inQuiet(quiet(), NIGHT)).toBe(true);
    expect(inQuiet(quiet(), NOON)).toBe(false);
    expect(inQuiet(quiet(false), NIGHT)).toBe(false);
    expect(inQuiet(quiet(true, "09:00", "09:00"), NIGHT)).toBe(false);
    expect(
      inQuiet(
        quiet(true, "13:00", "15:00"),
        Date.parse("2026-11-21T11:00:00Z"),
      ),
    ).toBe(true);
  });

  it("silences every kind on this computer during quiet hours", () => {
    const prefs = { ...defaultAlertPrefs(), quiet: quiet() };
    expect(desktopAllowed(prefs, "suggestion", NIGHT)).toBe(false);
    expect(desktopAllowed(prefs, "part_down", NIGHT)).toBe(false);
    expect(desktopAllowed(prefs, "suggestion", NOON)).toBe(true);
    const off = {
      ...prefs,
      kinds: { ...prefs.kinds, part_down: { phone: true, desktop: false } },
    };
    expect(desktopAllowed(off, "part_down", NOON)).toBe(false);
  });
});

describe("pause words", () => {
  it("tell a midnight end by its day and another end by its time", () => {
    expect(pauseEndWords("2026-11-24T21:00:00.000Z")).toBe("25 Kasım Çarşamba");
    expect(pauseEndWords("2026-11-24T11:30:00.000Z")).toBe(
      "24 Kasım Salı 14:30",
    );
  });

  it("find tomorrow on the Istanbul calendar", () => {
    expect(tomorrowIso(Date.parse("2026-11-21T22:30:00Z"))).toBe("2026-11-23"); // already the 22nd in Istanbul
    expect(tomorrowIso(NOON)).toBe("2026-11-22");
  });
});
