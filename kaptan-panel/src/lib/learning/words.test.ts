import { calibrationWords, errorWords, foldWords, learningSentence, pointsWords, rangeWords, stepWords, thresholdWords } from "./words";

describe("Ne öğrendim · words", () => {
  it("says the takeaway, or the honest empty sentence", () => {
    expect(learningSentence(null)).toBe("Öğrendiklerimi topluyorum…");
    const base = { generated_at: null, auto_apply: true, estimator_tr: "", kinds: [], changes: [], rejected: [], folds: [] };
    expect(learningSentence({ ...base, takeaway_tr: null })).toBe("Henüz yeterince karar olgunlaşmadı.");
    expect(learningSentence({ ...base, takeaway_tr: "Eşik indi." })).toBe("Eşik indi.");
  });

  it("writes gains as points with a Turkish comma and a sign", () => {
    expect(pointsWords(41)).toBe("+0,4 puan");
    expect(pointsWords(-12)).toBe("−0,1 puan");
    expect(pointsWords(2)).toBe("0 puan");
    expect(rangeWords(6, 77)).toBe("+0,1 ile +0,8 puan arası");
  });

  it("writes thresholds as the rules do", () => {
    expect(thresholdWords(0.0025, "pct")).toBe("%0,25");
    expect(thresholdWords(0.1, "pct")).toBe("%10,0");
    expect(thresholdWords(1_000_000, "try")).toBe("1.000.000 TL");
    expect(stepWords({ from_value: 0.0025, to_value: 0.002, unit: "pct" })).toBe("%0,25 → %0,20");
  });

  it("explains a correction that has not started and one that has", () => {
    const waiting = { n_matured: 4, needed: 30, slope: null, bias_bps: null, factor: 1, active: false };
    expect(calibrationWords(waiting)).toBe("Sonucu belli olan karar: 4 / 30. Tahminler 30 karardan sonra düzeltilmeye başlar.");
    const on = { n_matured: 41, needed: 30, slope: 0.7, bias_bps: -30, factor: 0.8, active: true };
    expect(calibrationWords(on)).toContain("0,80 ile çarpılıyor");
    expect(calibrationWords(on)).toContain("−0,3 puan");
  });

  it("says which years taught and which tested, and how well", () => {
    expect(foldWords("2022 → 2023")).toBe("2022'den öğrendi, 2023'te denedi");
    expect(foldWords("2022–23 → 2024")).toBe("2022–2023'ten öğrendi, 2024'te denedi");
    expect(errorWords({ error_ratio: null, n_val: 0 })).toBe("veri yok");
    expect(errorWords({ error_ratio: 0.98, n_val: 452 })).toBe("düz ortalamadan %2,0 daha az yanıldı");
    expect(errorWords({ error_ratio: 1, n_val: 10 })).toBe("düz ortalama kadar yanıldı");
  });
});
