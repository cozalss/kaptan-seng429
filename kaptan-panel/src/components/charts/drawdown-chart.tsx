"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { fmtShortDate, fmtSignedPct, fmtPct } from "@/lib/format";
import { DataTable, type Column } from "@/components/ui/table";
import { ChartFrame, TooltipCard, type LegendItem } from "./chart-frame";
import { niceTicks, type DrawdownRow } from "./series";

const AXIS_TICK = { fill: "var(--muted)", fontSize: 12 } as const;

/**
 * Drawdown from peak with the −5 % kill line (R01) over daily P&L bars with the −1 % halt line
 * (R02) — 08 §8.1 panel 3. North red is spent only on the kill line (and the area once the
 * kill switch has fired); ochre only on the daily halt line and halt-day bars.
 */
export function DrawdownChart({
  rows,
  killAt,
  haltAt,
  killed,
  sample = false,
}: {
  rows: readonly DrawdownRow[];
  killAt: number;
  haltAt: number;
  killed: boolean;
  sample?: boolean;
}) {
  const minDd = Math.min(...rows.map((r) => r.drawdown), killAt);
  const ddTicks = niceTicks([Math.floor((minDd - 0.006) / 0.01) * 0.01, 0], 4);
  const ddDomain: [number, number] = [ddTicks[0] ?? -0.06, 0];
  const dailies = rows.map((r) => r.daily);
  const dTicks = niceTicks([Math.min(...dailies, haltAt) - 0.004, Math.max(...dailies, 0.005) + 0.002], 4);
  const dDomain: [number, number] = [dTicks[0] ?? -0.02, dTicks[dTicks.length - 1] ?? 0.01];
  const last = rows[rows.length - 1];
  const areaColor = killed ? "var(--north)" : "var(--ink)";

  const legend: LegendItem[] = [
    { key: "dd", label: "Zirveden düşüş (v1.1-fwd)", color: killed ? "var(--north)" : "var(--wash)", shape: "rect" },
    { key: "kill", label: `Kill switch ${fmtPct(killAt, 0)} (R01)`, color: "var(--north)", dash: "5 3", shape: "rule" },
    { key: "halt", label: `Günlük durdurma ${fmtPct(haltAt, 0)} (R02)`, color: "var(--ochre)", dash: "5 3", shape: "rule" },
  ];

  const columns: Column<DrawdownRow>[] = [
    { key: "d", header: "Tarih", cell: (r) => (r.live ? `${fmtShortDate(r.d)} (gün içi)` : fmtShortDate(r.d)), sortValue: (r) => r.d },
    { key: "dd", header: "Zirveden düşüş", align: "right", cell: (r) => fmtPct(r.drawdown, 2), sortValue: (r) => r.drawdown },
    { key: "daily", header: "Günlük K/Z", align: "right", cell: (r) => fmtSignedPct(r.daily, 2), sortValue: (r) => r.daily },
  ];

  return (
    <ChartFrame
      title="Düşüş ve günlük K/Z"
      meta="v1.1-fwd · eşik çizgileri kanonik limitlerden (06 §9)"
      legend={legend}
      sample={sample}
      table={
        <div className="max-h-[320px] overflow-y-auto border border-hairline">
          <DataTable caption="Düşüş ve günlük K/Z — tablo" columns={columns} rows={[...rows].reverse()} getRowId={(r) => r.d + (r.live ? "-l" : "")} stickyHeader />
        </div>
      }
    >
      {(width) => (
        <div
          role="img"
          aria-label={`Zirveden düşüş grafiği. Son değer ${last ? fmtPct(last.drawdown, 2) : "yok"}, kill switch eşiği ${fmtPct(killAt, 0)}. Son günlük K/Z ${last ? fmtSignedPct(last.daily, 2) : "yok"}, durdurma eşiği ${fmtPct(haltAt, 0)}.`}
        >
          <AreaChart width={width} height={178} data={rows as DrawdownRow[]} margin={{ top: 8, right: 12, bottom: 10, left: 0 }} syncId="kaptan-risk" accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--hairline)" />
            <XAxis dataKey="d" hide />
            <YAxis domain={ddDomain} tickFormatter={(v: number) => fmtPct(v, 0)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} ticks={ddTicks} interval={0} />
            <ReferenceLine y={0} stroke="var(--ink)" strokeWidth={1} />
            <ReferenceLine y={killAt} stroke="var(--north)" strokeDasharray="5 3" strokeWidth={1.25} label={{ value: `kill switch ${fmtPct(killAt, 0)}`, position: "insideBottomRight", fill: "var(--north)", fontSize: 12 }} />
            <Tooltip cursor={{ stroke: "var(--ink)", strokeWidth: 1 }} isAnimationActive={false} content={(p) => <RiskTip rows={rows} label={p.label} active={p.active} />} />
            <Area type="linear" dataKey="drawdown" stroke={areaColor} strokeWidth={1.75} fill={killed ? "var(--north-tint)" : "var(--wash-tint-strong)"} isAnimationActive={false} baseValue={0} />
          </AreaChart>
          <BarChart width={width} height={130} data={rows as DrawdownRow[]} margin={{ top: 10, right: 12, bottom: 0, left: 0 }} syncId="kaptan-risk" barCategoryGap={1} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--hairline)" />
            <XAxis dataKey="d" tickFormatter={(d: string) => fmtShortDate(d)} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--rule-soft)" }} minTickGap={28} />
            <YAxis domain={dDomain} tickFormatter={(v: number) => fmtSignedPct(v, 0)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} ticks={dTicks} interval={0} />
            <ReferenceLine y={0} stroke="var(--ink)" strokeWidth={1} />
            <ReferenceLine y={haltAt} stroke="var(--ochre)" strokeDasharray="5 3" strokeWidth={1.5} />
            <Tooltip cursor={{ fill: "var(--wash-tint)" }} isAnimationActive={false} content={(p) => <RiskTip rows={rows} label={p.label} active={p.active} />} />
            <Bar dataKey="daily" isAnimationActive={false} maxBarSize={10}>
              {rows.map((r) => (
                <Cell key={r.d + (r.live ? "l" : "")} fill={r.daily <= haltAt ? "var(--ochre)" : r.live ? "var(--wash)" : "var(--ink-soft)"} />
              ))}
            </Bar>
          </BarChart>
        </div>
      )}
    </ChartFrame>
  );
}

function RiskTip({ rows, label, active }: { rows: readonly DrawdownRow[]; label?: string | number; active?: boolean }) {
  if (!active || label === undefined) return null;
  const row = rows.find((r) => r.d === label);
  if (!row) return null;
  return (
    <TooltipCard
      title={row.live ? `${fmtShortDate(row.d)} · gün içi (canlı)` : fmtShortDate(row.d)}
      rows={[
        { key: "dd", label: "zirveden düşüş", value: fmtPct(row.drawdown, 2), color: "var(--ink)" },
        { key: "daily", label: "günlük K/Z", value: fmtSignedPct(row.daily, 2), color: row.daily <= -0.01 ? "var(--ochre)" : "var(--ink-soft)" },
      ]}
    />
  );
}
