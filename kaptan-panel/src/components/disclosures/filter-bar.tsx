"use client";

import { useState } from "react";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { isNarrowed, TYPE_LABEL, TYPES, type Filters, type TypeFilter, type Whose } from "./filters";

const TICKER = /^[A-Z0-9]{3,6}$/;

/**
 * Cut the day: by date, by company (its short code), by what KAPtan thought it was, only what led to a
 * suggestion, only your companies. Each change goes to the address (the screen does that), so it can be shared.
 */
export function FilterBar({ filters, today, onChange }: { filters: Filters; today: string | null; onChange: (next: Filters) => void }) {
  const [typed, setTyped] = useState(filters.company ?? "");
  const [bad, setBad] = useState(false);
  const applyCompany = () => {
    const code = typed.trim().toLocaleUpperCase("tr-TR");
    if (code === "") {
      setBad(false);
      onChange({ ...filters, company: null });
    } else if (TICKER.test(code)) {
      setBad(false);
      onChange({ ...filters, company: code });
    } else setBad(true);
  };
  return (
    <form
      role="search"
      aria-label="Duyuruları süz"
      className="ok-filters"
      onSubmit={(e) => {
        e.preventDefault();
        applyCompany();
      }}
    >
      <label className="ok-field">
        <span>Gün</span>
        <Input type="date" value={filters.day ?? today ?? ""} max={today ?? undefined} onChange={(e) => e.target.value && onChange({ ...filters, day: e.target.value, open: null })} />
      </label>
      <label className="ok-field">
        <span>Şirket kodu</span>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value.toLocaleUpperCase("tr-TR").replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          onBlur={applyCompany}
          placeholder="THYAO"
          aria-invalid={bad || undefined}
          aria-describedby={bad ? "ok-code-help" : undefined}
          autoComplete="off"
        />
        {bad ? (
          <span id="ok-code-help" role="alert" className="text-dense text-loss">
            Kod 3 ile 6 harf ya da rakam olmalı.
          </span>
        ) : null}
      </label>
      <label className="ok-field">
        <span>KAPtan ne sandı?</span>
        <select className="ok-select" value={filters.type ?? ""} onChange={(e) => onChange({ ...filters, type: (e.target.value || null) as TypeFilter | null })}>
          <option value="">Hepsi</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="ok-field">
        <span>Hangi şirketler?</span>
        <select className="ok-select" value={filters.whose ?? ""} onChange={(e) => onChange({ ...filters, whose: (e.target.value || null) as Whose | null })}>
          <option value="">Hepsi</option>
          <option value="izlediklerim">İzlediklerim</option>
          <option value="benim">İzlediklerim ve elimdekiler</option>
        </select>
      </label>
      <label className="ok-check">
        <input type="checkbox" checked={filters.acted} onChange={(e) => onChange({ ...filters, acted: e.target.checked })} />
        <span>Yalnız öneri çıkanlar</span>
      </label>
      {isNarrowed(filters) ? (
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setTyped("");
            onChange({ ...filters, company: null, type: null, acted: false, whose: null });
          }}
        >
          Süzgeçleri temizle
        </Button>
      ) : null}
    </form>
  );
}
