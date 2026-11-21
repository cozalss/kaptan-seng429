"use client";

import "@/components/portfolio/corporate.css";

import { useState } from "react";
import type { CorporateNotice } from "@/lib/domain/corporate";
import { useApi, useApiQuery } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { CorporateForm, defaultsFromNotice } from "@/components/portfolio/corporate-forms";

/**
 * A calm prompt when KAP says a company you hold pays a dividend, hands out bonus shares or sells
 * rights. The sentence carries only what the code could read; when it could not read the numbers it
 * says so. Nothing changes your money until you write what reached your bank ("Yazayım").
 * Self-contained: the home and Param both mount it as is. Renders nothing when there is nothing to ask.
 */
export function CorporatePrompt({ onChanged, reloadKey = "" }: { onChanged?: () => void; reloadKey?: string }) {
  const q = useApiQuery((api) => api.corporateNotices(), [reloadKey]);
  const [writing, setWriting] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const notices = q.data?.notices ?? [];
  if (!notices.length && !status) return null;

  const done = (message: string) => {
    setWriting(null);
    setStatus(message);
    void q.refetch();
    onChanged?.();
  };

  return (
    <section aria-label="Şirketlerden haberler" className="cp">
      <p role="status" className="cp-status">
        {status}
      </p>
      {notices.map((n) => (
        <Notice key={n.id} n={n} open={writing === n.id} onOpen={() => { setStatus(null); setWriting(n.id); }} onDone={done} onClose={() => setWriting(null)} onDismissed={() => void q.refetch()} />
      ))}
    </section>
  );
}

function Notice({ n, open, onOpen, onDone, onClose, onDismissed }: { n: CorporateNotice; open: boolean; onOpen: () => void; onDone: (m: string) => void; onClose: () => void; onDismissed: () => void }) {
  const api = useApi();
  const [failure, setFailure] = useState<string | null>(null);
  const dismiss = async () => {
    try {
      await api.dismissNotice(n.id);
      onDismissed();
    } catch (err) {
      setFailure(errorMessage(err));
    }
  };
  const kind = n.kind === "split" ? "bonus" : n.kind;
  return (
    <article className="cp-item" aria-label={`${n.ticker} duyurusu`}>
      <p className="u-caption">KAP’ta yeni bir duyuru</p>
      <p className="cp-headline">{n.headline}</p>
      {n.facts_note ? <p className="cp-note">{n.facts_note}</p> : null}
      {failure ? (
        <p role="alert" className="mf-error mf-error--form">
          {failure}
        </p>
      ) : null}
      {open ? (
        <CorporateForm kind={kind} defaults={defaultsFromNotice(n)} onDone={onDone} onCancel={onClose} />
      ) : (
        <div className="cp-actions">
          <Button variant="primary" onClick={onOpen} aria-label={`${n.ticker}: yazayım`}>
            Yazayım
          </Button>
          <Button variant="ghost" onClick={() => void dismiss()} aria-label={`${n.ticker}: şimdi değil`}>
            Şimdi değil
          </Button>
          <a className="cp-link" href={n.url} target="_blank" rel="noopener noreferrer">
            Bildirimi KAP’ta aç
          </a>
        </div>
      )}
    </article>
  );
}
