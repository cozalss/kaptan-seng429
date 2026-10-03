"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Dense, sortable table. Ruled like a ledger: ink rule under the head, hairlines between
 * rows, tabular numerals. Rows with `onRowClick` are focusable and open on Enter/Space.
 */
export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => number | string;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
}

export type SortDir = "asc" | "desc";

export function sortRows<T>(rows: readonly T[], col: Column<T> | undefined, dir: SortDir): T[] {
  if (!col?.sortValue) return [...rows];
  const get = col.sortValue;
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "tr");
    return dir === "asc" ? cmp : -cmp;
  });
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  caption,
  onRowClick,
  rowClassName,
  initialSort,
  empty,
  className,
  stickyHeader = false,
}: {
  columns: readonly Column<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  /** Screen-reader caption (required: tables must be named). */
  caption: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  initialSort?: { key: string; dir: SortDir };
  empty?: ReactNode;
  className?: string;
  stickyHeader?: boolean;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    return sortRows(rows, col, sort?.dir ?? "asc");
  }, [rows, columns, sort]);

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full border-collapse text-dense">
        <caption className="sr-only">{caption}</caption>
        <thead className={cn(stickyHeader && "sticky top-0 z-10")}>
          <tr className="border-b-[1.5px] border-ink bg-sunk">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = active ? (sort?.dir === "asc" ? "ascending" : "descending") : c.sortValue ? "none" : undefined;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cn(
                    "h-9 px-3 text-left text-meta font-medium whitespace-nowrap text-ink-soft",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.headerClassName,
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => setSort({ key: c.key, dir: active && sort?.dir === "asc" ? "desc" : "asc" })}
                      className={cn("inline-flex items-center gap-1 hover:text-ink", active && "text-ink")}
                    >
                      {c.header}
                      <span aria-hidden className="w-2 text-[10px]">
                        {active ? (sort?.dir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty ?? <p className="px-3 py-6 text-ui text-muted">Kayıt yok.</p>}</td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr
                key={getRowId(row)}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "border-b border-hairline align-middle",
                  onRowClick && "cursor-pointer hover:bg-wash-tint focus-visible:bg-wash-tint focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
                  rowClassName?.(row),
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("h-10 px-3 py-1.5", c.align === "right" && "text-right tabular-nums", c.align === "center" && "text-center", c.className)}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
