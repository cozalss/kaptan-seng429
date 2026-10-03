"use client";

import { memo, type KeyboardEvent } from "react";
import type { DisclosureListItem } from "@/lib/domain";
import { routeLabel } from "@/lib/domain";
import { fmtDec, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, EventBadge, FixtureBadge } from "@/components/ui/badge";
import { routeGroup } from "./inbox-logic";

/**
 * The day's ledger: one ruled row per disclosure, newest on top. Selection is roving (one
 * row in the tab order), j/k move it, Enter opens. Rows that arrive over SSE are set down
 * with a brief indigo wash and a "yeni" mark until opened — never a flash, never a jump
 * of focus. The page scrolls; the column head stays under the top bar.
 */
export const REASON_LABEL: Readonly<Record<DisclosureListItem["reason"], string>> = {
  NEW: "Yeni",
  UPD: "Güncelleme",
  CORR: "Düzeltme",
  CANC: "İptal",
};

const STICKY_TOP = "top-[calc(var(--chrome-top,0px)+var(--topbar-h)+32px)] lg:top-[calc(var(--chrome-top,0px)+var(--topbar-h))]";

export interface FeedTableProps {
  rows: readonly DisclosureListItem[];
  selectedId: number | null;
  arrived: ReadonlySet<number>;
  unseen: ReadonlySet<number>;
  onSelect: (index: number) => void;
  onOpen: (index: number) => void;
}

export function FeedTable({ rows, selectedId, arrived, unseen, onSelect, onOpen }: FeedTableProps) {
  const tabStop = selectedId !== null && rows.some((r) => r.disclosure_index === selectedId) ? selectedId : (rows[0]?.disclosure_index ?? null);
  return (
    <table className="w-full table-fixed border-collapse text-dense" aria-rowcount={rows.length + 1}>
      <caption className="sr-only">Bugünkü KAP bildirimleri, en yenisi üstte. j ve k ile gezinin, Enter ile açın.</caption>
      <thead className={cn("sticky z-10", STICKY_TOP)}>
        <tr className="border-b-[1.5px] border-ink bg-sunk text-left text-meta text-ink-soft">
          <Th className="w-[52px] sm:w-[64px]">Saat</Th>
          <Th className="w-[74px] sm:w-[92px]">Sembol</Th>
          <Th className="hidden w-[190px] xl:table-cell">Şirket</Th>
          <Th>Konu</Th>
          <Th className="hidden w-[150px] md:table-cell">Ön eleme · rota</Th>
          <Th className="w-[66px] sm:w-[112px]">Sınıf</Th>
          <Th className="hidden w-[62px] lg:table-cell">Dil</Th>
          <Th className="hidden w-[100px] lg:table-cell" title="Bildirim nedeni: yeni, güncelleme, düzeltme, iptal">Neden</Th>
          <Th className="hidden w-[60px] text-right lg:table-cell" title="Bağlı haber sayısı">
            Haber
          </Th>
          <Th className="hidden w-[48px] text-right lg:table-cell" title="Not sayısı">
            Not
          </Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <FeedRow
            key={r.disclosure_index}
            row={r}
            selected={r.disclosure_index === selectedId}
            tabStop={r.disclosure_index === tabStop}
            arrived={arrived.has(r.disclosure_index)}
            unseen={unseen.has(r.disclosure_index)}
            onSelect={onSelect}
            onOpen={onOpen}
          />
        ))}
      </tbody>
    </table>
  );
}

function Th({ className, children, title }: { className?: string; children: React.ReactNode; title?: string }) {
  return (
    <th scope="col" title={title} className={cn("h-9 px-2 font-medium whitespace-nowrap first:pl-3 sm:px-3", className)}>
      {children}
    </th>
  );
}

interface RowProps {
  row: DisclosureListItem;
  selected: boolean;
  tabStop: boolean;
  arrived: boolean;
  unseen: boolean;
  onSelect: (index: number) => void;
  onOpen: (index: number) => void;
}

const FeedRow = memo(function FeedRow({ row: r, selected, tabStop, arrived, unseen, onSelect, onOpen }: RowProps) {
  const idx = r.disclosure_index;
  const group = routeGroup(r.subject_route);
  const muted = group === "noise";
  const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(idx);
    }
  };
  return (
    <tr
      id={`bildirim-${idx}`}
      data-index={idx}
      tabIndex={tabStop ? 0 : -1}
      aria-selected={selected}
      onClick={() => onOpen(idx)}
      onFocus={() => onSelect(idx)}
      onKeyDown={onKeyDown}
      className={cn(
        "group cursor-pointer scroll-mt-40 border-b border-hairline align-middle",
        "hover:bg-wash-tint focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
        selected && "bg-wash-tint shadow-[inset_3px_0_0_var(--ink)]",
        arrived && "animate-row-arrive",
      )}
    >
      <td className="h-10 px-2 first:pl-3 sm:px-3">
        <time dateTime={r.published_at} title={fmtTime(r.published_at, true)} className={cn("tabular-nums", muted ? "text-muted" : "text-ink-soft")}>
          {fmtTime(r.published_at)}
        </time>
      </td>
      <td className="px-2 sm:px-3">
        <span className="flex items-center gap-1.5">
          <span className={cn("code font-medium", muted ? "text-ink-soft" : "text-ink")}>{r.primary_ticker ?? "—"}</span>
          {unseen ? (
            <span className="inline-flex items-center gap-1 text-meta text-wash" aria-label="yeni">
              <span aria-hidden className="size-1.5 bg-wash" />
              <span className="hidden sm:inline">yeni</span>
            </span>
          ) : null}
        </span>
      </td>
      <td className="hidden truncate px-3 text-ink-soft xl:table-cell" title={r.company_name}>
        {r.company_name}
      </td>
      <td className="px-2 sm:px-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("min-w-0 truncate", muted ? "text-muted" : "text-ink")} title={r.subject}>
            {r.subject}
          </span>
          {r.ingest_source === "demo" ? <FixtureBadge className="shrink-0" /> : null}
          {r.is_late ? (
            <Badge tone="muted" className="hidden shrink-0 sm:inline-flex" title="KAP'a geç düştü">
              geç
            </Badge>
          ) : null}
        </span>
      </td>
      <td className="hidden px-3 md:table-cell">
        <span className={cn("block truncate", muted ? "text-muted" : group === "event" || group === "llm" ? "text-ink" : "text-ink-soft")} title={r.subject_route}>
          {routeLabel(r.subject_route)}
        </span>
      </td>
      <td className="px-2 sm:px-3">
        <ClassCell row={r} />
      </td>
      <td className="hidden px-3 lg:table-cell">
        <span className={cn("text-meta", r.has_multilang ? "text-ink" : "text-muted")}>{r.has_multilang ? "TR·EN" : "TR"}</span>
      </td>
      <td className="hidden px-3 lg:table-cell">
        {r.reason === "NEW" ? (
          <span className="text-meta text-muted">Yeni</span>
        ) : (
          <Badge tone={r.reason === "CANC" ? "ink" : "outline"} title={`${r.reason}${r.related_index ? ` · ilgili #${r.related_index}` : ""}`}>
            {REASON_LABEL[r.reason]}
          </Badge>
        )}
      </td>
      <td className="hidden px-3 text-right tabular-nums lg:table-cell">
        <Count n={r.linked_news_count} label="bağlı haber" />
      </td>
      <td className="hidden px-3 text-right tabular-nums lg:table-cell">
        <Count n={r.note_count} label="not" />
      </td>
    </tr>
  );
});

function Count({ n, label }: { n: number; label: string }) {
  if (n === 0) return <span className="text-muted" aria-label={`${label} yok`}>·</span>;
  return (
    <span className="font-medium text-ink" aria-label={`${n} ${label}`}>
      {n}
    </span>
  );
}

function ClassCell({ row }: { row: DisclosureListItem }) {
  const c = row.classification;
  if (!c) {
    if (row.run_id) {
      return (
        <span className="inline-flex items-center gap-1.5 text-meta text-wash">
          <span aria-hidden className="size-1.5 animate-pulse-dot bg-wash" />
          <span className="truncate">Sınıflandırılıyor…</span>
        </span>
      );
    }
    return <span className="text-muted">—</span>;
  }
  const isEvent = c.event_type.startsWith("E");
  return (
    <span className="flex items-center gap-1.5" title={`${c.method === "llm" ? "LLM" : "Konu haritası"} · güven ${fmtDec(c.confidence)}`}>
      <EventBadge type={c.event_type} compact />
      {isEvent ? <span className="hidden text-meta text-ink-soft tabular-nums sm:inline">{fmtDec(c.confidence)}</span> : null}
    </span>
  );
}
