import { NBSP } from "@/lib/format";
import { approvedSentence, confidenceSentence, confidenceWord, dayLabel, fmtLira, fmtLiraShort, fmtSignedLira, liraParts, skippedSentence, titleTr } from "./words";

const s = (text: string) => text.replaceAll(NBSP, " ");

describe("single-user words", () => {
  it("formats money the Turkish way, with the lira sign after the figure", () => {
    expect(s(fmtLira(3000))).toBe("3.000 ₺");
    expect(s(fmtLira(1250, true))).toBe("1.250,00 ₺");
    expect(s(fmtLira(-2300.4))).toBe("−2.300 ₺");
    expect(s(fmtLira(1018615.4, true))).toBe("1.018.615,40 ₺");
  });

  it("splits the headline figure so the kuruş can be set smaller", () => {
    expect(liraParts(1018615.4)).toEqual({ whole: "1.018.615", cents: "40" });
    expect(liraParts(-12.5)).toEqual({ whole: "−12", cents: "50" });
    expect(liraParts(0)).toEqual({ whole: "0", cents: "00" });
  });

  it("signs a change and writes zero plainly", () => {
    expect(s(fmtSignedLira(18615))).toBe("+18.615 ₺");
    expect(s(fmtSignedLira(-2300))).toBe("−2.300 ₺");
    expect(s(fmtSignedLira(0.2))).toBe("0 ₺");
  });

  it("shortens axis ticks", () => {
    expect(s(fmtLiraShort(1_020_000))).toBe("1,02 mn ₺");
    expect(s(fmtLiraShort(850_000))).toBe("850 bin ₺");
    expect(s(fmtLiraShort(500))).toBe("500 ₺");
  });

  it("turns confidence into one word", () => {
    expect(confidenceWord(0.8)).toBe("Güçlü");
    expect(confidenceWord(0.7)).toBe("Güçlü");
    expect(confidenceWord(0.6)).toBe("Orta");
    expect(confidenceWord(0.45)).toBe("Orta");
    expect(confidenceWord(0.2)).toBe("Zayıf");
  });

  it("says how sure KAPtan is as a sentence, and never oversells it", () => {
    expect(confidenceSentence(0.8)).toBe("KAPtan buna güveniyor, ama garanti değil.");
    expect(confidenceSentence(0.6)).toBe("KAPtan orta derecede emin.");
    expect(confidenceSentence(0.25)).toBe("KAPtan pek emin değil.");
  });

  it("says what an answer did", () => {
    expect(approvedSentence("al", "KRGCL")).toBe("KRGCL alımını onayladın.");
    expect(approvedSentence("sat", "KRGSG")).toBe("KRGSG satışını onayladın.");
    expect(approvedSentence("tut", "FRZEN")).toBe("FRZEN elinde kalıyor.");
    expect(skippedSentence("ORNCM")).toBe("ORNCM önerisini geçtin.");
  });

  it("title-cases company names in Turkish and keeps A.Ş.", () => {
    expect(titleTr("FARAZİ ENERJİ DAĞITIM A.Ş.")).toBe("Farazi Enerji Dağıtım A.Ş.");
    expect(titleTr("İSTANBUL ÇİMENTO")).toBe("İstanbul Çimento");
  });

  it("labels a day the short way", () => {
    expect(dayLabel("2027-01-11")).toBe("11 Oca");
  });
});
