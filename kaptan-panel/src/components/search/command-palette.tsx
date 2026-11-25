"use client";

import "./palette.css";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SearchResult } from "@/lib/company/company";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { titleTr } from "@/lib/solo/words";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { allPageRows, MIN_QUERY, pageRows, rowsOf, TYPING_PAUSE_MS, type SearchRow } from "./search-logic";

const KIND_WORD: Readonly<Record<SearchRow["kind"], string>> = { page: "Sayfalar", company: "Şirketler", disclosure: "Duyurular" };
const INPUT_LABEL = "Sayfa, şirket ya da duyuru";
const KIND_ORDER: readonly SearchRow["kind"][] = ["page", "company", "disclosure"];

/**
 * Ctrl+K: one box to go anywhere. Before typing it lists every screen; typing finds screens, companies and
 * disclosures through the same search as "/". The arrows move, Enter opens, Escape closes and focus goes back
 * where it was (Radix). Loaded only on the first Ctrl+K, so the home never pays for it.
 */
export default function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const api = useApi();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // A fresh box each time it opens (set during render, not in an effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQ("");
  }

  const typed = q.trim().length >= MIN_QUERY;
  useEffect(() => {
    const query = q.trim();
    if (query.length < MIN_QUERY) return;
    let alive = true;
    const timer = setTimeout(() => {
      setPending(true);
      api
        .search(query)
        .then((r) => {
          if (!alive) return;
          setResult(r);
          setError(null);
        })
        .catch((e: unknown) => alive && setError(errorMessage(e)))
        .finally(() => alive && setPending(false));
    }, TYPING_PAUSE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, api]);

  const rows = typed ? [...pageRows(q), ...rowsOf(result)] : allPageRows();
  const go = (to: string) => {
    onOpenChange(false);
    router.push(to);
  };
  const status = !typed ? null : pending ? "Arıyorum…" : error ? error : rows.length === 0 ? "Bu aramaya uyan bir şey bulamadım." : `${rows.length} sonuç`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Nereye gitmek istersin?" description="Bir sayfa, şirket ya da duyuru yaz; oklarla seç, Enter ile aç." size="md" className="cp">
        <Command label={INPUT_LABEL} shouldFilter={false} loop className="cp-command">
          {/* The same words cmdk gives the box as its name, shown for the eye. */}
          <p aria-hidden className="cp-label">
            {INPUT_LABEL}
          </p>
          <Command.Input value={q} onValueChange={setQ} placeholder="Öneriler, THYAO, temettü…" className="cp-input" maxLength={60} autoFocus />
          <p role="status" aria-live="polite" className="cp-status">
            {status}
          </p>
          <Command.List className="cp-list">
            {KIND_ORDER.map((kind) => {
              const group = rows.filter((r) => r.kind === kind);
              return group.length ? (
                <Command.Group key={kind} heading={KIND_WORD[kind]} className="cp-group">
                  {group.map((r) => (
                    <Command.Item key={r.key} value={r.key} onSelect={() => go(r.to)} className="cp-item">
                      <span className="cp-title">{r.kind === "company" ? titleTr(r.title) : r.title}</span>
                      <span className="cp-sub">{r.sub}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null;
            })}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
