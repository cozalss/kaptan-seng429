import type { DisclosureListItem } from "@/lib/domain";
import { funnelPolygon, funnelStages, kapUrl, plainSaid, readingSentence, whatKaptanDid } from "./reading-words";

const row = (over: Partial<DisclosureListItem> = {}): DisclosureListItem =>
  ({ disclosure_index: 1651901, subject: "Özel Durum Açıklaması (Genel)", summary: "Şube açılışı hakkında bilgilendirme.", is_noise: false, run_id: null, subject_route: "archive_only", ingest_source: "live", classification: null, stock_codes: [], primary_ticker: null, company_name: "MİSAL A.Ş.", ...over }) as DisclosureListItem;

describe("readingSentence", () => {
  const day = "2027-01-11";
  it("says how many were read and how many might matter, with the right suffix", () => {
    expect(readingSentence({ total: 350, useful: 3, day, today: day })).toBe("Bugün 350 duyuru okudum, 3’ü işine yarayabilir.");
    expect(readingSentence({ total: 350, useful: 1, day, today: day })).toBe("Bugün 350 duyuru okudum, 1’i işine yarayabilir.");
    expect(readingSentence({ total: 258, useful: 6, day, today: day })).toBe("Bugün 258 duyuru okudum, 6’sı işine yarayabilir.");
    expect(readingSentence({ total: 1240, useful: 10, day, today: day })).toBe("Bugün 1.240 duyuru okudum, 10’u işine yarayabilir.");
  });

  it("does not pretend when nothing came out of the day", () => {
    expect(readingSentence({ total: 350, useful: 0, day, today: day })).toBe("Bugün 350 duyuru okudum; işine yarayacak bir şey çıkmadı.");
    expect(readingSentence({ total: 0, useful: 0, day, today: day })).toBe("Bugün henüz duyuru okumadım.");
  });

  it("talks about another day in the past tense", () => {
    expect(readingSentence({ total: 340, useful: 2, day: "2027-01-08", today: day })).toBe("8 Ocak’ta 340 duyuru okudum, 2’si işine yarayabilirdi.");
    expect(readingSentence({ total: 340, useful: 0, day: "2027-01-08", today: day })).toBe("8 Ocak’ta 340 duyuru okudum; işine yarayacak bir şey çıkmamıştı.");
    expect(readingSentence({ total: 0, useful: 0, day: "2027-01-08", today: day })).toBe("8 Ocak’ta okunacak duyuru yoktu.");
  });
});

describe("funnel", () => {
  const counts = { total: 318, noise: 86, archived: 219, processed: 13, useful: 3 };

  it("narrows from everything read to what might matter", () => {
    expect(funnelStages(counts).map((s) => s.value)).toEqual([318, 232, 13, 3]);
  });

  it("never lets what might matter exceed what was looked at closely", () => {
    expect(funnelStages({ ...counts, processed: 2, useful: 5 }).map((s) => s.value)).toEqual([318, 232, 5, 5]);
  });

  it("draws a closed shape whose height follows the stages, on a 0-100 box", () => {
    const poly = funnelPolygon([318, 159, 0], 8);
    expect(poly.startsWith("polygon(")).toBe(true);
    const points = poly
      .slice(8, -1)
      .split(",")
      .map((p) => p.trim().split(" ").map((v) => Number.parseFloat(v)));
    expect(points[0]).toEqual([0, 0]);
    expect(points[points.length - 1]).toEqual([0, 100]);
    expect(points[points.length - 2]?.[0]).toBe(100);
    const xs = points.slice(0, -2).map((p) => p[0] as number);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(Math.min(...points.map((p) => p[1] as number))).toBe(0);
  });

  it("keeps a thread visible for a stage that is tiny next to the total, and copes with an empty day", () => {
    const poly = funnelPolygon([1000, 1], 4);
    const ys = poly
      .slice(8, -1)
      .split(",")
      .map((p) => Number.parseFloat(p.trim().split(" ")[1] ?? "0"));
    expect(Math.max(...ys.slice(0, -2))).toBeLessThanOrEqual(99);
    expect(funnelPolygon([0, 0], 4)).toBe("polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%)");
  });
});

describe("plainSaid", () => {
  it("turns the official subject into plain words", () => {
    expect(plainSaid(row({ subject: "Genel Kurul İşlemlerine İlişkin Bildirim", summary: "Olağan genel kurul toplantı ilanı." }))).toBe("Ortaklar toplantısının tarihini duyurdu.");
    expect(plainSaid(row({ subject: "Devre Kesici Uygulanması", summary: "Pay bazında devre kesici uygulandı (otomatik bildirim)." }))).toBe("Hissede işlemler kısa süre durdu.");
    expect(plainSaid(row({ subject: "Sermaye Artırımı - Bedelli", summary: "Bedelli sermaye artırımı kararı." }))).toBe("Yeni hisse satarak para toplayacak.");
  });

  it("falls back on the summary, then the subject", () => {
    expect(plainSaid(row({ subject: "Özel Durum Açıklaması (Genel)", summary: "Şube açılışı hakkında bilgilendirme." }))).toBe("Şube açılışı hakkında bilgilendirme.");
    expect(plainSaid(row({ subject: "Bilinmeyen Konu", summary: "" }))).toBe("Bilinmeyen Konu");
  });
});

describe("whatKaptanDid", () => {
  it("says what happened and why, first person", () => {
    expect(whatKaptanDid(row({ is_noise: true, subject_route: "noise" }), null)).toBe("Borsanın otomatik mesajı. Baktım, geçtim.");
    expect(whatKaptanDid(row(), null)).toBe("Para kararı gerektirmiyor. Dosyaladım.");
    expect(whatKaptanDid(row({ subject_route: "avoid:dilutive_rights" }), null)).toBe("Elindeki payı küçültebilir. Bu hisseden uzak duruyorum.");
    expect(whatKaptanDid(row({ subject_route: "avoid:measure" }), null)).toBe("Borsa bu hisseye tedbir koymuş. Uzak duruyorum.");
    expect(whatKaptanDid(row({ subject_route: "avoid:yeni_tur" }), null)).toBe("Riskli bir haber. Bu hisseden uzak duruyorum.");
    expect(whatKaptanDid(row({ run_id: "r1", subject_route: "E3" }), null)).toBe("Yakından baktım; öneri çıkmadı.");
  });

  it("follows the suggestion once there is one", () => {
    const r = row({ run_id: "r1", subject_route: "E3" });
    expect(whatKaptanDid(r, { status: "pending", side: "buy" })).toBe("Almanı öneriyorum. Karar senin.");
    expect(whatKaptanDid(r, { status: "pending", side: "sell" })).toBe("Satmanı öneriyorum. Karar senin.");
    expect(whatKaptanDid(r, { status: "approved", side: "buy" })).toBe("Almanı önerdim, onayladın.");
    expect(whatKaptanDid(r, { status: "rejected", side: "buy" })).toBe("Almanı önerdim, reddettin.");
    expect(whatKaptanDid(r, { status: "expired", side: "buy" })).toBe("Almanı önerdim; süresi doldu.");
  });
});

describe("kapUrl", () => {
  it("links to the disclosure's own page at KAP, but not a fixture", () => {
    expect(kapUrl(row())).toBe("https://www.kap.org.tr/tr/Bildirim/1651901");
    expect(kapUrl(row({ ingest_source: "demo" }))).toBeNull();
  });
});
