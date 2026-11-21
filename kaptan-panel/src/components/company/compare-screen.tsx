"use client";

import "./company.css";
import "./company-read.css";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PERIODS, PERIOD_LABEL, periodFromParam, type Period } from "@/lib/company/company";
import { CompareFinder } from "./compare-finder";
import type { CompareSide } from "@/lib/domain/reading";
import { useApiQuery } from "@/lib/api/react";
import { fmtInt, fmtSignedFigurePct } from "@/lib/format";
import { href, ROUTES } from "@/lib/nav";
import { fmtLira } from "@/lib/solo/words";
import { PageHeader, ScreenState } from "@/components/shell/page-frame";
import { Button } from "@/components/ui/button";
import { TwoLines } from "./two-lines";

const CODE = /^[A-Z0-9]{3,6}$/;

function readCode(value: string | null): string | null {
  const up = (value ?? "").toLocaleUpperCase("tr-TR");
  return CODE.test(up) ? up : null;
}

/** The change from the first to the last stored close of the period, percent; null without two closes. Pure. */
export function periodChange(side: Pick<CompareSide, "price">): number | null {
  const pts = side.price.points;
  const first = pts[0]?.close;
  const last = pts.at(-1)?.close;
  if (!first || last === undefined || pts.length < 2) return null;
  return Math.round((last / first - 1) * 10_000) / 100;
}

/** "+%2,8" / "−%13,16": the app's Turkish percent, sign in front. */
const pct = (n: number | null) => (n === null ? "Hesaplanamadı" : fmtSignedFigurePct(n / 100));
const lira = (n: number | null) => (n === null ? "Kayıtlı değil" : fmtLira(n, true));

function rowsOf(s: CompareSide): Array<[string, string]> {
  return [
    ["Son kapanış", lira(s.price.last_close)],
    ["Seçtiğin dönemde değişim", pct(periodChange(s))],
    ["Yılın en düşüğü", lira(s.stats?.year_low ?? null)],
    ["Yılın en yükseği", lira(s.stats?.year_high ?? null)],
    ["Yılın en yükseğine uzaklık", s.stats?.from_high_pct == null ? "Hesaplanamadı" : pct(s.stats.from_high_pct)],
    ["Son 90 günde okuduğum duyuru", fmtInt(s.events.total)],
    ["… geri alım", fmtInt(s.events.buyback)],
    ["… yönetici ya da ana ortak alımı", fmtInt(s.events.insider)],
    ["… yeni iş ya da ihale", fmtInt(s.events.deal)],
    ["… kâr ya da zarar açıklaması", fmtInt(s.events.earnings)],
  ];
}

/**
 * /karsilastir?a=THYAO&b=PGSUS: two companies side by side. Both price lines start at 100 on the first day
 * both have a close; under them the stored numbers and what KAP brought in the last 90 days. No multiples.
 */
export function CompareScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const a = readCode(params.get("a"));
  const b = readCode(params.get("b"));
  const period: Period = periodFromParam(params.get("donem")) ?? "1y";
  const watch = useApiQuery((api) => api.watchlist(), []);
  const q = useApiQuery((api) => (a && b && a !== b ? api.compare(a, b, period) : Promise.resolve(null)), [a, b, period]);

  // Companies found through "Başka bir şirket bul" join the lists for this visit.
  const [found, setFound] = useState<ReadonlyArray<readonly [string, string]>>([]);
  const options = useMemo(() => {
    const seen = new Map<string, string>();
    for (const w of watch.data ?? []) seen.set(w.ticker, w.name);
    for (const [code, name] of found) if (!seen.has(code)) seen.set(code, name);
    for (const c of [a, b]) if (c && !seen.has(c)) seen.set(c, c);
    return [...seen.entries()];
  }, [watch.data, found, a, b]);

  const go = (next: { a?: string | null; b?: string | null; donem?: Period }) => {
    const p = new URLSearchParams();
    const na = next.a === undefined ? a : next.a;
    const nb = next.b === undefined ? b : next.b;
    if (na) p.set("a", na);
    if (nb) p.set("b", nb);
    p.set("donem", next.donem ?? period);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const right = q.data ? rowsOf(q.data.b) : [];
  const sentence = a && b && a !== b ? `${a} ile ${b} yan yana.` : "İki şirketi yan yana koy.";
  return (
    <div className="co-screen">
      <PageHeader
        name="Karşılaştır"
        title={sentence}
        lead={<p>İki şirketin fiyatını aynı başlangıçtan, KAP’tan okuduklarımı da yan yana görürsün. Kimin daha iyi bir hisse olduğunu söylemem; yalnızca kayıtlı rakamları gösteririm.</p>}
      />
      <div className="co-pick">
        {(["a", "b"] as const).map((side) => {
          const value = side === "a" ? a : b;
          return (
            <label key={side}>
              {side === "a" ? "Birinci şirket" : "İkinci şirket"}
              <select value={value ?? ""} onChange={(e) => go({ [side]: e.target.value || null })}>
                <option value="">Seç…</option>
                {options.map(([code, name]) => (
                  <option key={code} value={code} disabled={code === (side === "a" ? b : a)}>
                    {code === name ? code : `${code} · ${name}`}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
        <CompareFinder
          side={a ? "b" : "a"}
          onPick={(h) => {
            setFound((f) => [...f.filter(([c]) => c !== h.ticker), [h.ticker, h.name] as const]);
            if (!a) go({ a: h.ticker });
            else if (h.ticker !== a) go({ b: h.ticker });
          }}
        />
      </div>
      {a && b && a === b ? (
        <p role="status" className="co-same">
          İki tarafta da {a} var. Karşılaştırmak için ikinci şirketi değiştir.
        </p>
      ) : null}
      {options.length < 2 && !a && !b && watch.data ? (
        <ScreenState kind="empty" title="Karşılaştıracak şirketin yok." action={<Button asChild variant="secondary"><Link href={ROUTES.bildirimler}>Okunanlar’a git</Link></Button>}>
          Bir şirketin sayfasında yıldıza basıp izlemeye alırsan burada seçebilirsin; ya da şirketin sayfasındaki “Başka bir hisseyle karşılaştır” bağlantısıyla gel.
        </ScreenState>
      ) : null}
      {q.error && !q.data ? (
        <ScreenState kind="error" title="Karşılaştırmayı getiremedim." onRetry={q.refetch}>
          {q.error}
        </ScreenState>
      ) : null}
      {q.data ? (
        <>
          <section aria-labelledby="cmp-fiyat" className="co-sec" aria-busy={q.refreshing}>
            <h2 id="cmp-fiyat" className="u-chapter text-ink">
              Fiyat
            </h2>
            <div role="group" aria-label="Dönem" className="co-periods">
              {PERIODS.map((p) => (
                <button key={p} type="button" aria-pressed={p === period} className="co-period" onClick={() => go({ donem: p })}>
                  {PERIOD_LABEL[p]}
                </button>
              ))}
            </div>
            <TwoLines a={q.data.a.price.points} b={q.data.b.price.points} labelA={q.data.a.ticker} labelB={q.data.b.ticker} />
          </section>
          <section aria-labelledby="cmp-rakam" className="co-sec">
            <h2 id="cmp-rakam" className="u-chapter text-ink">
              Rakamlar
            </h2>
            <table className="cmp-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Rakam</span>
                  </th>
                  {[q.data.a, q.data.b].map((s) => (
                    <th key={s.ticker} scope="col">
                      <Link href={href.company(s.ticker)} className="co-link">
                        {s.ticker}
                      </Link>
                      <br />
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsOf(q.data.a).map(([label, left], i) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{left}</td>
                    <td>{right[i]?.[1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </div>
  );
}
