"use client";

import { LIMIT_META, type LimitValue, type LimitVersion } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { diffLimits, formatLimit, LIMIT_DESCRIPTION, STATUS_LABEL, type DiffRow } from "./limits-logic";

export const STATUS_TONE: Readonly<Record<LimitVersion["status"], BadgeProps["tone"]>> = {
  proposed: "wash-solid",
  active: "ink",
  superseded: "muted",
  rejected: "north",
};

export function StatusBadge({ status }: { status: LimitVersion["status"] }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

/** The active version as a ledger: rule code, limit, value, what it does. */
export function CurrentLimitsTable({ values }: { values: readonly LimitValue[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-dense">
        <caption className="sr-only">Geçerli limit değerleri</caption>
        <thead>
          <tr className="border-b-[1.5px] border-ink bg-sunk text-meta text-ink-soft">
            <th scope="col" className="h-9 w-[64px] px-3 text-left font-medium">
              Kural
            </th>
            <th scope="col" className="h-9 px-3 text-left font-medium">
              Limit
            </th>
            <th scope="col" className="h-9 w-[96px] px-3 text-right font-medium">
              Değer
            </th>
            <th scope="col" className="hidden h-9 px-3 text-left font-medium lg:table-cell">
              Ne yapar
            </th>
          </tr>
        </thead>
        <tbody>
          {values.map((v) => (
            <tr key={v.key} className="border-b border-hairline align-top">
              <td className="px-3 py-2.5">
                <span className="code text-muted">{LIMIT_META[v.key].rule}</span>
              </td>
              <td className="px-3 py-2.5">
                <span className="block text-ink">{LIMIT_META[v.key].label_tr}</span>
                <span className="code block text-meta text-muted">{v.key}</span>
              </td>
              <td className="px-3 py-2.5 text-right text-[15px] font-medium text-ink tabular-nums">{formatLimit(v.key, v.value)}</td>
              <td className="hidden px-3 py-2.5 text-ink-soft lg:table-cell">{LIMIT_DESCRIPTION[v.key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EffectMark({ row }: { row: DiffRow }) {
  if (!row.changed || !row.effect) return null;
  return (
    <span className={cn("text-meta", row.effect === "looser" ? "text-ink" : "text-muted")}>
      {row.effect === "looser" ? "daha gevşek · daha çok risk" : "daha sıkı · daha az risk"}
    </span>
  );
}

/** Old → new, changed rows inked; unchanged rows can be hidden. */
export function LimitDiff({
  from,
  to,
  onlyChanged = false,
  caption,
}: {
  from: readonly LimitValue[];
  to: readonly LimitValue[];
  onlyChanged?: boolean;
  caption: string;
}) {
  const rows = diffLimits(from, to).filter((r) => !onlyChanged || r.changed);
  if (rows.length === 0) return <p className="px-4 py-6 text-ui text-muted">İki sürüm aynı: değişen limit yok.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-dense">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b-[1.5px] border-ink bg-sunk text-meta text-ink-soft">
            <th scope="col" className="h-9 px-3 text-left font-medium">
              Limit
            </th>
            <th scope="col" className="h-9 w-[92px] px-3 text-right font-medium">
              Eski
            </th>
            <th scope="col" aria-hidden className="h-9 w-6" />
            <th scope="col" className="h-9 w-[92px] px-3 text-right font-medium">
              Yeni
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={cn("border-b border-hairline", r.changed && "bg-wash-tint shadow-[inset_3px_0_0_var(--ink)]")}>
              <td className="px-3 py-2">
                <span className={cn("block", r.changed ? "font-medium text-ink" : "text-ink-soft")}>
                  {LIMIT_META[r.key].label_tr} <span className="code text-meta text-muted">{LIMIT_META[r.key].rule}</span>
                </span>
                <EffectMark row={r} />
              </td>
              <td className={cn("px-3 py-2 text-right tabular-nums", r.changed ? "text-muted line-through decoration-1" : "text-ink-soft")}>
                {r.before === null ? "—" : formatLimit(r.key, r.before)}
              </td>
              <td aria-hidden className="text-center text-muted">
                {r.changed ? "→" : ""}
              </td>
              <td className={cn("px-3 py-2 text-right tabular-nums", r.changed ? "text-[15px] font-semibold text-ink" : "text-ink-soft")}>
                {r.after === null ? "—" : formatLimit(r.key, r.after)}
                {r.changed ? <span className="sr-only"> (değişti)</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Version history as a vertical ledger; a row selects it for comparison. */
export function VersionHistory({
  versions,
  selected,
  onSelect,
}: {
  versions: readonly LimitVersion[];
  selected: number | null;
  onSelect: (version: number) => void;
}) {
  return (
    <ol className="divide-y divide-hairline">
      {versions.map((v) => {
        const active = selected === v.version;
        return (
          <li key={v.version}>
            <button
              type="button"
              onClick={() => onSelect(v.version)}
              aria-pressed={active}
              className={cn(
                "flex w-full gap-3 px-4 py-3 text-left hover:bg-wash-tint focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
                active && "bg-wash-tint",
              )}
            >
              <span className={cn("font-display w-10 shrink-0 text-[26px] leading-none text-ink", v.status === "rejected" && "text-muted")}>v{v.version}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={v.status} />
                  <span className="text-meta text-muted tabular-nums">{fmtDate(v.created_at)}</span>
                </span>
                <span className="mt-1 block text-dense text-ink">{v.reason}</span>
                <span className="mt-1 block text-meta text-muted">
                  Öneren {v.created_by_name}
                  {v.approved_by_name ? ` · ${v.status === "rejected" ? "Reddeden" : "Onaylayan"} ${v.approved_by_name}` : " · ikinci onay bekleniyor"}
                  {v.effective_from ? ` · yürürlük ${fmtDateTime(v.effective_from)}` : ""}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
