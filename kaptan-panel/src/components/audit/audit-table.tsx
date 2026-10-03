"use client";

import Link from "next/link";
import { useState } from "react";
import type { AuditEntry } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { fmtDate, fmtInt, fmtTime, shortHash } from "@/lib/format";
import { DataTable, type Column } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { FixtureBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/primitives";
import { ACTION_FAMILIES, ACTOR_KINDS, actionLabel, actorView, hasFilters, isCriticalAction, type AuditFilters } from "./audit-logic";

const selectCls =
  "h-10 w-full border-[1.5px] border-ink bg-panel px-2 text-ui text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

const KIND_MARK: Record<"user" | "agent" | "system", string> = {
  user: "border-ink bg-ink",
  agent: "border-wash bg-wash-tint",
  system: "border-rule-soft bg-panel",
};

export function AuditFiltersBar({ filters, onChange }: { filters: AuditFilters; onChange: (f: AuditFilters) => void }) {
  const [entity, setEntity] = useState(filters.entity);
  const [lastEntity, setLastEntity] = useState(filters.entity);
  if (filters.entity !== lastEntity) {
    setLastEntity(filters.entity);
    setEntity(filters.entity);
  }
  const set = (patch: Partial<AuditFilters>) => onChange({ ...filters, ...patch, page: 1 });
  return (
    <form
      role="search"
      aria-label="Denetim kaydı filtreleri"
      onSubmit={(e) => {
        e.preventDefault();
        set({ entity: entity.trim() });
      }}
      className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_1.2fr_1.4fr_1fr_auto]"
    >
      <label className="space-y-1 text-dense font-medium text-ink">
        <span>Aktör</span>
        <select className={selectCls} value={filters.actor} onChange={(e) => set({ actor: e.target.value })}>
          <option value="">Tümü</option>
          {ACTOR_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-dense font-medium text-ink">
        <span>Eylem</span>
        <select className={selectCls} value={filters.action} onChange={(e) => set({ action: e.target.value })}>
          <option value="">Tümü</option>
          {ACTION_FAMILIES.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="col-span-2 space-y-1 text-dense font-medium text-ink md:col-span-1">
        <span>Varlık (tür ya da kimlik)</span>
        <Input
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          onBlur={() => entity.trim() !== filters.entity && set({ entity: entity.trim() })}
          placeholder="ör. trade_proposal, 1651901"
          spellCheck={false}
        />
      </label>
      <label className="space-y-1 text-dense font-medium text-ink">
        <span>Tarihten</span>
        <Input type="date" value={filters.from} min="2026-11-16" onChange={(e) => set({ from: e.target.value })} />
      </label>
      <div className="flex items-end">
        <Button
          variant="ghost"
          className="w-full md:w-auto"
          disabled={!hasFilters(filters)}
          onClick={() => {
            setEntity("");
            onChange({ actor: "", action: "", entity: "", from: "", run_id: "", page: 1 });
          }}
        >
          Temizle
        </Button>
      </div>
    </form>
  );
}

export function AuditLedger({
  items,
  highlightPos,
  onOpen,
  filtered,
}: {
  items: readonly AuditEntry[];
  highlightPos: number | null;
  onOpen: (e: AuditEntry) => void;
  filtered: boolean;
}) {
  const columns: Column<AuditEntry>[] = [
    {
      key: "pos",
      header: "#",
      align: "right",
      className: "w-[84px]",
      cell: (e) => <span className="code text-ink">{fmtInt(e.chain_pos)}</span>,
    },
    {
      key: "at",
      header: "Zaman",
      className: "w-[150px] whitespace-nowrap",
      cell: (e) => (
        <time dateTime={e.occurred_at} className="text-ink-soft">
          <span className="text-muted">{fmtDate(e.occurred_at)}</span> {fmtTime(e.occurred_at, true)}
        </time>
      ),
    },
    {
      key: "actor",
      header: "Aktör",
      headerClassName: "hidden md:table-cell",
      className: "hidden md:table-cell",
      cell: (e) => {
        const a = actorView(e.actor);
        return (
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden className={cn("size-2 shrink-0 border", KIND_MARK[a.kind])} />
            <span className="truncate text-ink">{a.label}</span>
          </span>
        );
      },
    },
    {
      key: "action",
      header: "Eylem",
      cell: (e) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn("text-ink", isCriticalAction(e.action) && "font-medium text-north")}>{actionLabel(e.action)}</span>
          <span className="code hidden text-muted xl:inline">{e.action}</span>
          {e.action === "demo.injected" ? <FixtureBadge /> : null}
        </span>
      ),
    },
    {
      key: "entity",
      header: "Varlık",
      headerClassName: "hidden lg:table-cell",
      className: "hidden max-w-[220px] lg:table-cell",
      cell: (e) => (
        <span className="code block truncate text-ink-soft" title={`${e.entity_type} · ${e.entity_id}`}>
          {e.entity_type} · {e.entity_id}
        </span>
      ),
    },
    {
      key: "run",
      header: "Run",
      headerClassName: "hidden xl:table-cell",
      className: "hidden max-w-[200px] xl:table-cell",
      cell: (e) =>
        e.run_id ? (
          <Link
            href={`/runs/${encodeURIComponent(e.run_id)}`}
            onClick={(ev) => ev.stopPropagation()}
            className="code block truncate text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            {e.run_id}
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "hash",
      header: "Hash",
      headerClassName: "hidden sm:table-cell",
      className: "hidden w-[110px] sm:table-cell",
      cell: (e) => <span className="code text-muted">{shortHash(e.hash)}</span>,
    },
  ];
  return (
    <DataTable
      caption="Denetim kaydı, en yeni kayıt üstte. Satır ayrıntıyı açar."
      columns={columns}
      rows={items}
      getRowId={(e) => String(e.chain_pos)}
      onRowClick={onOpen}
      rowClassName={(e) => (e.chain_pos === highlightPos ? "bg-wash-tint shadow-[inset_3px_0_0_var(--ink)]" : undefined)}
      empty={
        <EmptyState
          title={filtered ? "Bu filtreyle kayıt yok." : "Kayıt yok."}
          body={filtered ? "Filtreleri gevşetin ya da temizleyin. Zincirin kendisi değişmez; yalnızca görünüm daralır." : "Zincir henüz başlamadı."}
        />
      }
    />
  );
}

export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  return (
    <nav aria-label="Sayfalar" className="flex flex-wrap items-center gap-3 border-t border-hairline px-4 py-3">
      <span className="text-meta text-muted tabular-nums">
        {fmtInt(total)} kayıt · sayfa {fmtInt(page)} / {fmtInt(pages)}
      </span>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(1)} aria-label="İlk sayfa (en yeni)">
          « En yeni
        </Button>
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ‹ Önceki
        </Button>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Sonraki ›
        </Button>
      </div>
    </nav>
  );
}
