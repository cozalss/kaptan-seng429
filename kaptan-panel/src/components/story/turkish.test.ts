import { titleTr } from "./turkish";

describe("titleTr", () => {
  it("title-cases a company name and keeps A.Ş. as written", () => {
    expect(titleTr("DOĞU ENERJİ ÜRETİM A.Ş.")).toBe("Doğu Enerji Üretim A.Ş.");
  });

  it("keeps the Turkish dotted and dotless i", () => {
    expect(titleTr("İZMİR")).toBe("İzmir");
    expect(titleTr("ISPARTA IŞIK")).toBe("Isparta Işık");
  });

  it("keeps short dotted abbreviations and the spacing, and does not change its input", () => {
    const name = "ÖRNEK  T.A.Ş. (BİST)";
    expect(titleTr(name)).toBe("Örnek  T.A.Ş. (Bist)");
    expect(name).toBe("ÖRNEK  T.A.Ş. (BİST)");
  });
});
