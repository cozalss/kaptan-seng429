import { describe, expect, it } from "vitest";
import { foldTr } from "@/lib/company/fold";
import { pageRows } from "./search-logic";

describe("page results in the search", () => {
  it("folds Turkish letters so plain typing finds a page", () => {
    expect(foldTr("Önemli Yardım İŞ")).toBe("onemli yardim is");
  });

  it("finds the important-disclosures page by its name, with or without Turkish letters", () => {
    for (const q of ["önemli", "onemli", "Önem"]) expect(pageRows(q).map((r) => r.to)).toContain("/onemli");
  });

  it("finds help and the calendar by a word of what they hold", () => {
    expect(pageRows("sözlük").map((r) => r.to)).toEqual(["/yardim"]);
    expect(pageRows("bilanço").map((r) => r.to)).toEqual(["/takvim"]);
  });

  it("marks page rows as pages and needs two letters", () => {
    expect(pageRows("takvim")[0]).toMatchObject({ kind: "page", title: "Takvim" });
    expect(pageRows("t")).toEqual([]);
  });

  it("does not answer a company code with a page", () => {
    expect(pageRows("THYAO")).toEqual([]);
  });
});
