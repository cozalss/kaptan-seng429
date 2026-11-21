"use client";

import { useState } from "react";
import type { Position } from "@/lib/domain";
import { fmtLira } from "@/lib/solo/words";
import { fmtFigurePct, fmtSignedFigurePct } from "@/lib/format";
import { shortName } from "@/components/story/plain";
import { Term } from "@/components/story/term";
import { possessive, titleTr } from "@/components/story/turkish";
import { Boat } from "@/components/ufuk/boat";
import { signTone } from "@/components/story/sign-tone";
import { cn } from "@/lib/utils";
import { skyline, type SkylineColumn } from "./param-words";

/** Tallest column above the water, in px of the plot (the same under it). */
const PLOT_H = 220;
const name = (c: SkylineColumn) => titleTr(shortName(c.name));

/** What the line under the picture says about one column. */
function columnLine(c: SkylineColumn): string {
  const delta = c.gain >= 0 ? `${fmtLira(c.gain)} kazandırıyor` : `${fmtLira(-c.gain)} kaybettiriyor`;
  return `${name(c)}: ${fmtLira(c.paid)} ödedin, şimdi ${fmtLira(c.value)} ediyor. ${delta} (${fmtSignedFigurePct(c.ratio)}).`;
}

/**
 * The money at sea. The whole width is all your money; each company is a column as wide as the money
 * in it, rising above the water by what it gained or sinking under it by what it lost (so its area is
 * the lira itself). The rest of the line is the cash: calm water, with the boat on it.
 */
export function Skyline({ positions, cash }: { positions: readonly Position[]; cash: number }) {
  const s = skyline(positions, cash);
  const [active, setActive] = useState<string | null>(null);
  const hit = s.columns.find((c) => c.ticker === active) ?? null;
  const gainTotal = s.columns.reduce((sum, c) => sum + c.gain, 0);
  const empty = s.columns.length === 0;
  const summary = empty
    ? "Paran şu an hiçbir şirkette değil. Nakit kazandırmaz da kaybettirmez de."
    : `Elindekiler, aldığın fiyata göre ${gainTotal >= 0 ? `${fmtLira(gainTotal)} kazandırıyor` : `${fmtLira(-gainTotal)} kaybettiriyor`}.`;
  const upH = s.up > 0 ? PLOT_H : 40;
  const downH = s.down > 0 ? PLOT_H * 0.6 : 0;

  return (
    <section aria-labelledby="su-ustu" className="pm-sky">
      <h2 id="su-ustu" className="sr-only">
        Param nerede?
      </h2>
      <div
        role="img"
        aria-label={`${summary} Sütunlar şirketler, genişlikleri içindeki para, yükseklikleri kazanç ya da kayıp. Aynı bilgiler aşağıda yazılı.`}
        className="pm-sky-plot"
        style={{ "--pm-up": `${upH}px`, "--pm-down": `${downH}px` } as React.CSSProperties}
        onPointerLeave={() => setActive(null)}
      >
        {s.columns.map((c, i) => (
          <div
            key={c.ticker + i}
            className={cn("pm-col", c.ratio < 0 && "pm-col-down", active === c.ticker && "pm-col-on")}
            style={{ flexGrow: c.share, "--pm-h": c.height, "--pm-i": i } as React.CSSProperties}
            onPointerEnter={() => setActive(c.ticker)}
            onPointerDown={() => setActive(c.ticker)}
          >
            <div className="pm-col-up">
              <span className="pm-col-bar u-hatch" />
              {/* The code, never a cut name: two companies can share a first word. Shown only where the column is wide enough (CSS). */}
              <span aria-hidden className="pm-col-label">
                <b>{c.ticker}</b>
                <span>{fmtSignedFigurePct(c.ratio)}</span>
              </span>
            </div>
            <div className="pm-col-under">
              <span className="pm-col-bar u-hatch" />
            </div>
          </div>
        ))}
        {s.cashShare > 0 || empty ? (
          <div className="pm-cash" style={{ flexGrow: Math.max(s.cashShare, empty ? 1 : 0) }}>
            <div className="pm-cash-sky">
              <Boat className="pm-boat" />
              <span className="pm-cash-label">
                <b>Nakit</b>
                <span>{fmtLira(cash)}</span>
              </span>
            </div>
          </div>
        ) : null}
      </div>
      <div aria-hidden className="pf-water" />
      {empty ? null : (
        <ul className="pm-sky-legend" aria-label="Sütunlar, soldan sağa">
          {s.columns.map((c, i) => (
            <li key={c.ticker + i}>
              <button type="button" aria-pressed={active === c.ticker} onClick={() => setActive(active === c.ticker ? null : c.ticker)} title={name(c)}>
                <b>{c.ticker}</b> <span className={signTone(c.ratio)}>{fmtSignedFigurePct(c.ratio)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p aria-live="off" className="pm-sky-read">
        {hit ? columnLine(hit) : summary}
      </p>
      {empty ? null : (
        <p className="pm-sky-key">
          Her sütun bir <Term word="hisse">hisse</Term>: ne kadar genişse içinde o kadar para var. Suyun üstündeyse aldığın fiyattan yukarıda, altındaysa aşağıda.
          {s.cashShare > 0 ? (
            <>
              {" "}
              Düz su <Term word="nakit">nakit</Term>, paranın {possessive(fmtFigurePct(s.cashShare))}.
            </>
          ) : null}
        </p>
      )}
    </section>
  );
}
