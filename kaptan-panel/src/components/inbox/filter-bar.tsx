"use client";

import { forwardRef, useId, type ReactNode } from "react";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/primitives";
import {
  activeFilterCount,
  CLASS_FILTER_OPTIONS,
  DEFAULT_FILTERS,
  EVENT_FILTER_OPTIONS,
  ROUTE_FILTER_OPTIONS,
  type ClassFilter,
  type EventFilter,
  type InboxFilters,
  type RouteFilter,
} from "./inbox-logic";

/**
 * Filter bar (FRONTEND-SPEC §2.2): search (ticker, company, subject — "/" focuses it),
 * E-code, disclosure class, route, and the noise toggle. Native selects: fast, keyboard-
 * and screen-reader-proof, styled as ink fields.
 */
const fieldCls =
  "h-9 border-[1.5px] border-ink bg-panel px-2 text-dense text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

export const FilterBar = forwardRef<HTMLInputElement, {
  filters: InboxFilters;
  onChange: (f: InboxFilters) => void;
  shown: number;
  total: number;
  noiseCount: number;
}>(function FilterBar({ filters, onChange, shown, total, noiseCount }, searchRef) {
  const searchId = useId();
  const set = <K extends keyof InboxFilters>(key: K, value: InboxFilters[K]) => onChange({ ...filters, [key]: value });
  const active = activeFilterCount(filters);
  return (
    <div role="search" aria-label="Bildirim filtreleri" className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2.5 sm:px-4">
      <div className="relative w-full sm:w-[260px]">
        <label htmlFor={searchId} className="sr-only">
          Sembol, şirket ya da konu ara
        </label>
        <svg aria-hidden width="13" height="13" viewBox="0 0 13 13" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-soft">
          <circle cx="5.5" cy="5.5" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8.7 8.7 12 12" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <input
          ref={searchRef}
          id={searchId}
          type="search"
          value={filters.q}
          onChange={(e) => set("q", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              if (filters.q) set("q", "");
              else e.currentTarget.blur();
            }
          }}
          placeholder="Sembol, şirket, konu…"
          autoComplete="off"
          spellCheck={false}
          className={cn(fieldCls, "w-full pr-8 pl-8 placeholder:text-muted [&::-webkit-search-cancel-button]:hidden")}
        />
        <Kbd className="absolute top-1/2 right-2 -translate-y-1/2" aria-hidden>
          /
        </Kbd>
      </div>
      <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
      <Select label="Sınıf (E-kodu)" value={filters.event} onChange={(v) => set("event", v as EventFilter)}>
        {EVENT_FILTER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <Select label="Bildirim türü" value={filters.cls} onChange={(v) => set("cls", v as ClassFilter)}>
        {CLASS_FILTER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <Select label="Rota" value={filters.route} onChange={(v) => set("route", v as RouteFilter)}>
        {ROUTE_FILTER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      </div>
      <label className="inline-flex h-9 cursor-pointer items-center gap-2 px-1 text-dense text-ink-soft select-none hover:text-ink">
        <input
          type="checkbox"
          checked={filters.showNoise}
          onChange={(e) => set("showNoise", e.target.checked)}
          className="size-4 accent-[var(--ink)]"
        />
        Gürültüyü göster <span className="text-muted tabular-nums">({fmtInt(noiseCount)})</span>
      </label>
      <div className="ml-auto flex items-center gap-3 text-meta text-muted">
        <span aria-live="polite" className="tabular-nums">
          {fmtInt(shown)} / {fmtInt(total)} bildirim
        </span>
        {active > 0 ? (
          <button type="button" onClick={() => onChange(DEFAULT_FILTERS)} className="font-medium text-ink underline underline-offset-4 hover:text-wash">
            Filtreleri temizle
          </button>
        ) : null}
      </div>
    </div>
  );
});

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(fieldCls, "w-full min-w-0 sm:w-auto", value !== "all" && "bg-wash-tint")} title={label}>
        {children}
      </select>
    </>
  );
}
