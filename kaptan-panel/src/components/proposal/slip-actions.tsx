"use client";

import { useEffect, useRef, useState } from "react";
import { DropdownMenu as M } from "radix-ui";
import type { OrderTicket } from "@/lib/domain";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { currentTimeMs } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { MENU_CONTENT, MENU_ITEM } from "@/components/ui/menu";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";
import { buildMarkInput, hasMarkErrors, initialDraft, markErrors, ticketCopyText, type MarkDraft, type MarkKind } from "@/components/tickets/ticket-logic";

/** How long "Kopyalandı" stays before the button says "Kopyala" again. */
const COPIED_MS = 2_400;

/**
 * The slip's actions: Girdim (then "how many, at what price"), Kopyala, and the small "…" for
 * Dolmadı / Girmedim. Kopyala answers in place: the button says so, the boxes flash once, and
 * the line under it shows the order line that went to the clipboard.
 */
export function SlipActions({ ticket, onMarked, onCopied }: { ticket: OrderTicket; onMarked: (t: OrderTicket) => void; onCopied?: () => void }) {
  const api = useApi();
  const { can } = useRole();
  const mayMark = can("ticket.mark");
  const [copied, setCopied] = useState<"idle" | "done" | "fail">("idle");
  const [draft, setDraft] = useState<MarkDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);
  const copyText = ticketCopyText(ticket);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied("done");
      onCopied?.();
    } catch {
      setCopied("fail");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied("idle"), COPIED_MS);
  };

  const mark = async (d: MarkDraft) => {
    if (d.kind === "entered" && hasMarkErrors(markErrors(d, ticket))) {
      setError(Object.values(markErrors(d, ticket)).find(Boolean) ?? null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onMarked(await api.markTicket(ticket.ticket_no, buildMarkInput(d, ticket)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const quick = (kind: MarkKind) => void mark(initialDraft(kind, ticket, currentTimeMs()));

  return (
    <div className="border-t border-hairline px-5 pt-4 pb-5 sm:px-6">
      {draft ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void mark(draft);
          }}
        >
          <p className="text-[16px] leading-6 text-ink">Kaç lot, hangi fiyattan doldu?</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-dense text-muted">Lot</span>
              <Input inputMode="numeric" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} className="h-11 tabular-nums" autoFocus />
            </label>
            <label className="space-y-1">
              <span className="text-dense text-muted">Ortalama fiyat (TL)</span>
              <Input inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className="h-11 tabular-nums" />
            </label>
          </div>
          {error ? (
            <p role="alert" className="text-dense text-north">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" size="lg" disabled={busy}>
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </Button>
            <Button variant="ghost" size="lg" onClick={() => setDraft(null)} disabled={busy}>
              Vazgeç
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Button variant="primary" size="lg" locked={!mayMark} disabled={!mayMark} onClick={() => setDraft(initialDraft("entered", ticket, currentTimeMs()))}>
              Girdim
            </Button>
            <Button variant="secondary" size="lg" className="min-w-[136px]" onClick={() => void copy()}>
              <span key={copied} className={cn("inline-flex items-center gap-1.5", copied !== "idle" && "animate-fade-in")}>
                {copied === "done" ? (
                  <>
                    Kopyalandı <span aria-hidden>✓</span>
                  </>
                ) : (
                  "Kopyala"
                )}
              </span>
            </Button>
            <M.Root modal={false}>
              <M.Trigger
                aria-label="Başka bir sonuç"
                disabled={busy || !mayMark}
                className="ml-auto grid size-12 place-items-center text-[20px] leading-none text-ink-soft transition-colors duration-[var(--dur-quick)] hover:bg-wash-tint hover:text-ink disabled:cursor-not-allowed disabled:text-rule-soft disabled:hover:bg-transparent"
              >
                <span aria-hidden>…</span>
              </M.Trigger>
              <M.Portal>
                <M.Content align="end" sideOffset={4} className={MENU_CONTENT}>
                  <M.Item onSelect={() => quick("unfilled")} className={MENU_ITEM}>
                    Dolmadı
                  </M.Item>
                  <M.Item onSelect={() => quick("canceled")} className={MENU_ITEM}>
                    Girmedim (iptal)
                  </M.Item>
                </M.Content>
              </M.Portal>
            </M.Root>
          </div>
          <p className="mt-3 min-h-5 text-dense text-muted" aria-live="polite">
            {copied === "fail" ? (
              <span className="text-ink">Panoya kopyalanamadı; kutulardaki alanları elle yaz.</span>
            ) : copied === "done" ? (
              <>
                <span className="text-ink">Panoya kopyalandı: </span>
                <span className="code text-ink-soft">{copyText.split("\n")[1]}</span>
              </>
            ) : (
              "Kopyala, emri aracı kurum uygulamana yapıştırmak için panoya alır."
            )}
          </p>
          <Denied action="ticket.mark" className="mt-2.5" />
          {error ? (
            <p role="alert" className="mt-2 text-dense text-north">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
