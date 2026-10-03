"use client";

import { useState } from "react";
import type { UniverseEntry } from "@/lib/domain";
import { useApiQuery } from "@/lib/api/react";
import { fmtCompact, fmtInt, fmtPct } from "@/lib/format";
import { DataTable, type Column } from "@/components/ui/table";
import { Badge, TemsiliBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { EmptyState, ErrorState, SkeletonLines } from "@/components/ui/primitives";
import { filterUniverse } from "./admin-logic";

const COLUMNS: Column<UniverseEntry>[] = [
  { key: "ticker", header: "Sembol", sortValue: (r) => r.ticker, cell: (r) => <span className="code font-medium text-ink">{r.ticker}</span> },
  {
    key: "name",
    header: "Şirket",
    sortValue: (r) => r.company_name,
    cell: (r) => <span className="text-ink">{r.company_name}</span>,
  },
  { key: "sector", header: "Sektör", sortValue: (r) => r.sector, headerClassName: "hidden md:table-cell", className: "hidden md:table-cell", cell: (r) => r.sector },
  { key: "group", header: "Grup", headerClassName: "hidden lg:table-cell", className: "hidden lg:table-cell text-ink-soft", cell: (r) => r.group ?? "—" },
  { key: "ff", header: "Halka açıklık", align: "right", sortValue: (r) => r.free_float_pct, headerClassName: "hidden sm:table-cell", className: "hidden sm:table-cell", cell: (r) => fmtPct(r.free_float_pct, 0) },
  { key: "adv", header: "ADV20", align: "right", sortValue: (r) => r.adv20_try, cell: (r) => <span title={`${fmtInt(r.adv20_try)} TL`}>{fmtCompact(r.adv20_try)} TL</span> },
  {
    key: "in",
    header: "Evren",
    align: "center",
    sortValue: (r) => (r.in_universe ? 1 : 0),
    cell: (r) => (r.in_universe ? <Badge tone="ink">içinde</Badge> : <Badge tone="muted">dışında</Badge>),
  },
];

/** Universe / watchlist (US-41, 06 R03): what the pre-gate lets through. */
export function UniversePanel() {
  const q = useApiQuery((a) => a.universe(), []);
  const [text, setText] = useState("");
  const [onlyIn, setOnlyIn] = useState(false);
  const rows = filterUniverse(q.data ?? [], text, onlyIn);
  const inCount = (q.data ?? []).filter((r) => r.in_universe).length;
  return (
    <Panel aria-labelledby="universe-title">
      <PanelHeader
        id="universe-title"
        code="R03"
        title="Evren · izleme listesi"
        meta={q.data ? `${inCount} / ${q.data.length} sembol evrende. Evren dışı bildirim LLM'e gitmeden ön elemede düşer.` : "Evren dışı bildirim LLM'e gitmeden ön elemede düşer."}
        actions={<TemsiliBadge />}
      />
      <div className="flex flex-wrap items-end gap-3 border-b border-hairline bg-paper px-4 py-3">
        <label className="min-w-[220px] flex-1 space-y-1 text-dense font-medium text-ink">
          <span>Ara</span>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Sembol, şirket ya da sektör" type="search" />
        </label>
        <label className="flex h-10 items-center gap-2 text-dense text-ink-soft">
          <input type="checkbox" checked={onlyIn} onChange={(e) => setOnlyIn(e.target.checked)} className="size-4 accent-[var(--ink)]" />
          Yalnızca evrendekiler
        </label>
      </div>
      {q.error ? (
        <div className="p-4">
          <ErrorState message={q.error} onRetry={() => void q.refetch()} />
        </div>
      ) : q.loading ? (
        <div className="p-4">
          <SkeletonLines lines={8} />
        </div>
      ) : (
        <DataTable
          caption="Evren listesi"
          columns={COLUMNS}
          rows={rows}
          getRowId={(r) => r.ticker}
          initialSort={{ key: "ticker", dir: "asc" }}
          empty={<EmptyState title="Eşleşen sembol yok." body="Aramayı değiştirin. Tüm şirketler kurgusaldır (Temsili)." />}
        />
      )}
    </Panel>
  );
}
