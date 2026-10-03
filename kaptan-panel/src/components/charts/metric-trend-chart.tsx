"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { fmtShortDate } from "@/lib/format";
import { DataTable, type Column } from "@/components/ui/table";
import { ChartFrame, TooltipCard, type LegendItem } from "./chart-frame";
import { niceTicks } from "./series";

const AXIS_TICK = { fill: "var(--muted)", fontSize: 12 } as const;

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  dash?: string;
}

export interface TrendTarget {
  y: number;
  label: string;
}

/**
 * Small multi-series trend over dates (RAGAS scores, 08 §8.1 panel 11). One 0–1 axis, target
 * rules labelled in the legend, markers on every run (few points), table twin.
 */
export function MetricTrendChart({
  title,
  meta,
  rows,
  series,
  targets = [],
  format,
  domain,
  sample,
  height = 240,
}: {
  title: string;
  meta?: string;
  rows: ReadonlyArray<{ d: string } & Record<string, number | string>>;
  series: readonly TrendSeries[];
  targets?: readonly TrendTarget[];
  format: (v: number) => string;
  domain: [number, number];
  sample?: boolean;
  height?: number;
}) {
  const ticks = niceTicks(domain, 5);
  const legend: LegendItem[] = [
    ...series.map((s) => ({ key: s.key, label: s.label, color: s.color, dash: s.dash })),
    ...targets.map((t) => ({ key: `t-${t.label}`, label: t.label, color: "var(--muted)", dash: "4 3", shape: "rule" as const })),
  ];
  const cols: Column<{ d: string } & Record<string, number | string>>[] = [
    { key: "d", header: "Koşu", cell: (r) => fmtShortDate(r.d), sortValue: (r) => r.d },
    ...series.map((s) => ({ key: s.key, header: s.label, align: "right" as const, cell: (r: Record<string, number | string>) => format(Number(r[s.key])) })),
  ];
  const last = rows[rows.length - 1];
  return (
    <ChartFrame
      title={title}
      meta={meta}
      legend={legend}
      sample={sample}
      table={<DataTable caption={`${title} — tablo`} columns={cols} rows={rows} getRowId={(r) => r.d} />}
    >
      {(width) => (
        <div role="img" aria-label={`${title}. Son koşu: ${series.map((s) => `${s.label} ${last ? format(Number(last[s.key])) : "—"}`).join(", ")}.`}>
          <LineChart width={width} height={height} data={[...rows]} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--hairline)" />
            <XAxis dataKey="d" tickFormatter={(d: string) => fmtShortDate(d)} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--rule-soft)" }} />
            <YAxis domain={[ticks[0] ?? domain[0], ticks[ticks.length - 1] ?? domain[1]]} ticks={ticks} interval={0} tickFormatter={format} tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
            {targets.map((t) => (
              <ReferenceLine key={t.label} y={t.y} stroke="var(--muted)" strokeDasharray="4 3" strokeWidth={1} />
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
                    title={fmtShortDate(row.d)}
                    rows={series.map((s) => ({ key: s.key, label: s.label, value: format(Number(row[s.key])), color: s.color, dash: s.dash }))}
                  />
                );
              }}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="linear"
                dataKey={s.key}
                stroke={s.color}
                strokeDasharray={s.dash}
                strokeWidth={s.key === series[0]?.key ? 2.25 : 1.75}
                dot={{ r: 3.5, fill: "var(--panel)", stroke: s.color, strokeWidth: 1.75 }}
                activeDot={{ r: 4.5, fill: s.color, stroke: "var(--panel)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </div>
      )}
    </ChartFrame>
  );
}
