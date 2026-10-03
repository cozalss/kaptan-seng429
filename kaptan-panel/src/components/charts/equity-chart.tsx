"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { fmtShortDate, fmtSignedPct } from "@/lib/format";
import { DataTable, type Column } from "@/components/ui/table";
import { ChartFrame, TooltipCard, type LegendItem } from "./chart-frame";
import { lastValues, niceTicks, returnDomain, SERIES_STYLE, spreadLabels, type FwdStrategy, type ReturnRow } from "./series";

const AXIS_TICK = { fill: "var(--muted)", fontSize: 12 } as const;
const END_LABEL_MIN_WIDTH = 560;
const PLOT_TOP = 8;
const X_AXIS_H = 30;
const LABEL_GAP = 15;

export interface EquityMarker {
  d: string;
  label: string;
}

/**
 * Cumulative return of KAPtan's forward paper arms vs the BIST-100 and equal-weight baselines
 * (08 §8.1 panel 2). One y-axis (return since start, %), zero rule, direct end labels on wide
 * screens, legend always, table twin. The live intraday point is drawn as an open ring.
 */
export function EquityChart({
  rows,
  strategies,
  title,
  meta,
  caption,
  markers = [],
  sample = false,
  height = 280,
  actions,
}: {
  rows: readonly ReturnRow[];
  strategies: readonly FwdStrategy[];
  title: string;
  meta?: string;
  caption?: React.ReactNode;
  markers?: readonly EquityMarker[];
  sample?: boolean;
  height?: number;
  actions?: React.ReactNode;
}) {
  const ends = lastValues(rows, strategies);
  const values = rows.flatMap((r) => strategies.map((s) => r.values[s]).filter((v): v is number => typeof v === "number"));
  const ticks = niceTicks(returnDomain(values), 7);
  const domain: [number, number] = [ticks[0] ?? -0.01, ticks[ticks.length - 1] ?? 0.01];
  const legend: LegendItem[] = strategies.map((s) => ({ key: s, label: SERIES_STYLE[s].label, color: SERIES_STYLE[s].color, dash: SERIES_STYLE[s].dash }));
  const summary = strategies
    .map((s) => `${SERIES_STYLE[s].label} ${ends[s] === undefined ? "veri yok" : fmtSignedPct(ends[s] as number, 1)}`)
    .join(", ");
  const liveRow = rows.find((r) => r.live);

  const columns: Column<ReturnRow>[] = [
    { key: "d", header: "Tarih", cell: (r) => (r.live ? `${fmtShortDate(r.d)} (gün içi)` : fmtShortDate(r.d)), sortValue: (r) => r.d },
    ...strategies.map<Column<ReturnRow>>((s) => ({
      key: s,
      header: SERIES_STYLE[s].label,
      align: "right",
      cell: (r) => (typeof r.values[s] === "number" ? fmtSignedPct(r.values[s] as number, 2) : "—"),
      sortValue: (r) => r.values[s] ?? -Infinity,
    })),
  ];

  return (
    <ChartFrame
      title={title}
      meta={meta}
      legend={legend}
      sample={sample}
      caption={caption}
      actions={actions}
      table={
        <div className="max-h-[320px] overflow-y-auto border border-hairline">
          <DataTable caption={`${title} — tablo`} columns={columns} rows={[...rows].reverse()} getRowId={(r) => r.d + (r.live ? "-live" : "")} stickyHeader />
        </div>
      }
    >
      {(width) => {
        const wide = width >= END_LABEL_MIN_WIDTH;
        const plotBottom = height - X_AXIS_H;
        const yOf = (v: number) => PLOT_TOP + (1 - (v - domain[0]) / (domain[1] - domain[0])) * (plotBottom - PLOT_TOP);
        const endLabels = wide
          ? spreadLabels(
              strategies.filter((s) => ends[s] !== undefined).map((s) => ({ key: s, text: `${SERIES_STYLE[s].short} ${fmtSignedPct(ends[s] as number, 1)}`, y: yOf(ends[s] as number) })),
              LABEL_GAP,
              PLOT_TOP + 6,
              plotBottom - 2,
            )
          : [];
        return (
          <div role="img" className="relative" aria-label={`${title}. Son değerler: ${summary}.`}>
            <LineChart
              width={width}
              height={height}
              data={rows as ReturnRow[]}
              margin={{ top: 8, right: wide ? 124 : 12, bottom: 0, left: 0 }}
              accessibilityLayer={false}
            >
              <CartesianGrid vertical={false} stroke="var(--hairline)" />
              <XAxis
                dataKey="d"
                tickFormatter={(d: string) => fmtShortDate(d)}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: "var(--rule-soft)" }}
                minTickGap={28}
              />
              <YAxis
                domain={domain}
                tickFormatter={(v: number) => fmtSignedPct(v, 1)}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={56}
                ticks={ticks}
                interval={0}
              />
              <ReferenceLine y={0} stroke="var(--ink)" strokeWidth={1} />
              {markers.map((m) => (
                <ReferenceLine
                  key={m.d}
                  x={m.d}
                  stroke="var(--rule-soft)"
                  strokeWidth={1}
                  label={{ value: m.label, position: "insideTopLeft", fill: "var(--muted)", fontSize: 12 }}
                />
              ))}
              <Tooltip
                cursor={{ stroke: "var(--ink)", strokeWidth: 1 }}
                isAnimationActive={false}
                content={({ active, label }) => {
                  if (!active || label === undefined) return null;
                  const row = rows.find((r) => r.d === label);
                  if (!row) return null;
                  return (
                    <TooltipCard
                      title={row.live ? `${fmtShortDate(row.d)} · gün içi (canlı)` : fmtShortDate(row.d)}
                      rows={strategies
                        .filter((s) => typeof row.values[s] === "number")
                        .map((s) => ({
                          key: s,
                          label: SERIES_STYLE[s].label,
                          value: fmtSignedPct(row.values[s] as number, 2),
                          color: SERIES_STYLE[s].color,
                          dash: SERIES_STYLE[s].dash,
                        }))}
                    />
                  );
                }}
              />
              {[...strategies].reverse().map((s) => {
                const st = SERIES_STYLE[s];
                return (
                  <Line
                    key={s}
                    type="linear"
                    dataKey={(r: ReturnRow) => r.values[s] ?? null}
                    name={st.label}
                    stroke={st.color}
                    strokeWidth={st.width}
                    strokeDasharray={st.dash}
                    dot={(p: { cx?: number; cy?: number; index?: number; payload?: ReturnRow }) => {
                      if (!p.payload?.live || p.cx === undefined || p.cy === undefined) return <g key={`${s}-${p.index}`} />;
                      return <circle key={`${s}-${p.index}`} cx={p.cx} cy={p.cy} r={4.5} fill="var(--panel)" stroke={st.color} strokeWidth={2} />;
                    }}
                    activeDot={{ r: 4, fill: st.color, stroke: "var(--panel)", strokeWidth: 2 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
            {endLabels.map((l) => (
              <span
                key={l.key}
                aria-hidden
                className="pointer-events-none absolute right-0 w-[116px] -translate-y-1/2 truncate text-meta text-ink-soft"
                style={{ top: l.y }}
              >
                {l.text}
              </span>
            ))}
            {liveRow ? (
              <p className="mt-1 text-meta text-muted">
                <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" className="mr-1 inline align-[-1px]">
                  <circle cx="6" cy="6" r="4" fill="var(--panel)" stroke="var(--ink)" strokeWidth="2" />
                </svg>
                Halka: bugünün gün içi değeri (risk durumundan, kapanışta kesinleşir).
              </p>
            ) : null}
          </div>
        );
      }}
    </ChartFrame>
  );
}

