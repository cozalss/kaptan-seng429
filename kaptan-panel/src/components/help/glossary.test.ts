import { describe, expect, it } from "vitest";
import { FAQ } from "./faq";
import { GLOSSARY, searchGlossary, sortedGlossary } from "./glossary";

// Words the app does not use (the brief's list); the help pages must not bring them back.
const BANNED = [
  "analist",
  "risk sorumlusu",
  "admin",
  "denetçi",
  "ekip",
  "takım",
  "üye",
  "ikinci imza",
  "kişisel mod",
  "Sharpe",
  "drawdown",
  "kill switch",
  "emir fişi",
  "seans",
  "lot ",
  "limit fiyat",
  "portföy",
  "denetim",
  "yatırım tavsiyesi",
];

describe("the glossary", () => {
  it("has unique ids and a sentence for each word", () => {
    expect(new Set(GLOSSARY.map((e) => e.id)).size).toBe(GLOSSARY.length);
    for (const e of GLOSSARY) expect(e.text.length).toBeGreaterThan(20);
  });

  it("covers the finance words the app shows", () => {
    for (const id of [
      "adet",
      "komisyon",
      "temettu",
      "bedelsiz",
      "bedelli",
      "zirve",
      "gunluk-sinir",
      "yedek",
      "oneri",
    ])
      expect(GLOSSARY.some((e) => e.id === id)).toBe(true);
  });

  it("is sorted the Turkish way and searchable regardless of case", () => {
    const names = sortedGlossary().map((e) => e.term);
    expect(names.indexOf("Çık")).toBe(-1);
    expect(searchGlossary("KOMİSYON").map((e) => e.id)).toContain("komisyon");
    expect(searchGlossary("  ").length).toBe(GLOSSARY.length);
    expect(searchGlossary("yokböylebirkelime")).toEqual([]);
  });

  it("stays clear of the words the app does not use", () => {
    const all = [
      ...GLOSSARY.map((e) => `${e.term} ${e.text}`),
      ...FAQ.flatMap((q) => [q.question, ...q.answer]),
    ]
      .join(" ")
      .toLocaleLowerCase("tr-TR");
    for (const word of BANNED)
      expect(all).not.toContain(word.toLocaleLowerCase("tr-TR"));
  });
});

describe("the questions", () => {
  it("answer the ones people ask first", () => {
    const asked = FAQ.map((q) => q.question).join(" ");
    for (const part of [
      "Öneri nedir",
      "Onaylarsam",
      "Param nerede",
      "Durdurma",
      "Ne kadar tutar",
      "Bilgisayar kapalıysa",
      "Yedeği",
    ])
      expect(asked).toContain(part);
    for (const q of FAQ) expect(q.answer.length).toBeGreaterThan(0);
  });
});
