"use client";

import "./search.css";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchResult } from "@/lib/company/company";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { MIN_QUERY, opensSearch, pageRows, rowsOf, TYPING_PAUSE_MS } from "./search-logic";

/**
 * One search for the whole app: a company by ticker or name (Turkish letters meet: "turk hava", "ISIK"), a
 * disclosure by its words. Opens with the button, "/" or Ctrl+K; Enter jumps to the first result, the arrows
 * move between results, Escape closes.
 */
export function SearchBox() {
  const api = useApi();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const open = useCallback(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    input.current?.focus();
  }, []);
  const close = useCallback(() => dialog.current?.close(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!opensSearch({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, target: e.target instanceof HTMLElement ? e.target : null })) return;
      e.preventDefault();
      open();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const query = q.trim();
    if (query.length < MIN_QUERY) return;
    let alive = true;
    const timer = setTimeout(() => {
      setPending(true);
      api
        .search(query)
        .then((r) => {
          if (alive) {
            setResult(r);
            setError(null);
          }
        })
        .catch((e: unknown) => alive && setError(errorMessage(e)))
        .finally(() => alive && setPending(false));
    }, TYPING_PAUSE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, api]);

  const typed = q.trim().length >= MIN_QUERY;
  const rows = typed ? [...pageRows(q), ...rowsOf(result)] : [];
  const go = (to: string) => {
    close();
    router.push(to);
  };
  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && rows[0]) go(rows[0].to);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      dialog.current?.querySelector<HTMLElement>(".sr-row")?.focus();
    }
  };
  const onRowKey = (e: React.KeyboardEvent<HTMLElement>) => {
    const sibling = e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.key === "ArrowUp" ? e.currentTarget.previousElementSibling : null;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    if (sibling instanceof HTMLElement) sibling.focus();
    else if (e.key === "ArrowUp") input.current?.focus();
  };

  return (
    <>
      <button type="button" className="sr-trigger" onClick={open} aria-label="Ara: şirket ya da duyuru (/)" aria-keyshortcuts="/ Control+K">
        <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <circle cx="10.5" cy="10.5" r="6.25" />
          <path d="M15.5 15.5 21 21" />
        </svg>
        <span className="sr-trigger-text">Ara</span>
        <kbd aria-hidden className="sr-kbd">/</kbd>
      </button>
      <dialog ref={dialog} className="sr-dialog" aria-label="Ara" onClose={() => setQ("")}>
        <label className="sr-label">
          <span className="sr-only">Şirket adı, kısa kodu ya da duyurudan bir kelime</span>
          <input
            ref={input}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Şirket ya da duyuru ara: THYAO, Türk Hava, temettü…"
            className="sr-input"
            autoComplete="off"
            maxLength={60}
          />
        </label>
        <div role="status" aria-live="polite" className="sr-status">
          {!typed ? "En az iki harf yaz." : pending ? "Arıyorum…" : error ? error : rows.length === 0 ? "Bu aramaya uyan bir şey bulamadım." : `${rows.length} sonuç`}
        </div>
        {rows.length ? (
          <ul className="sr-list">
            {rows.map((r) => (
              <li key={r.key} className="contents">
                <a
                  href={r.to}
                  className="sr-row"
                  data-kind={r.kind}
                  onKeyDown={onRowKey}
                  onClick={(e) => {
                    e.preventDefault();
                    go(r.to);
                  }}
                >
                  <span className="sr-kind">{r.kind === "page" ? "Sayfa" : r.kind === "company" ? "Şirket" : "Duyuru"}</span>
                  <span className="sr-title">{r.title}</span>
                  <span className="sr-sub">{r.sub}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" className="sr-close" onClick={close}>
          Kapat (Esc)
        </button>
      </dialog>
    </>
  );
}
