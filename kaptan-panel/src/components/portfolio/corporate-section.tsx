"use client";

import "@/components/ufuk/ufuk.css";
import "./own-money.css";
import "./corporate.css";

import { useRef, useState } from "react";
import type { CorporateBook, CorporateKind } from "@/lib/domain/corporate";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { recordSentence } from "@/lib/corporate-words";
import { fmtLira } from "@/lib/solo/words";
import { Button } from "@/components/ui/button";
import { CorporatePrompt } from "@/components/solo/corporate-prompt";
import { CorporateForm } from "./corporate-forms";

const SHOWN = 5;
const OPENERS: ReadonlyArray<{ kind: CorporateKind; label: string }> = [
  { kind: "dividend", label: "Kâr payı geldi" },
  { kind: "bonus", label: "Bedelsiz pay geldi" },
  { kind: "rights", label: "Bedelli pay aldım" },
];

/**
 * Param's company actions: what the shares paid you in dividends (a real return, counted in
 * "Başladığından beri"), three buttons to write down what reached your bank, the KAP prompt, and
 * every record as one sentence. A record is never deleted; "Geri al" adds a correction.
 */
export function CorporateSection({ book, hasHoldings, holdingsKey, onChanged }: { book: CorporateBook | null; hasHoldings: boolean; holdingsKey: string; onChanged: () => void }) {
  const api = useApi();
  const [panel, setPanel] = useState<CorporateKind | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);

  const close = (message: string | null) => {
    setPanel(null);
    setStatus(message);
    requestAnimationFrame(() => opener.current?.focus());
    if (message) onChanged();
  };
  const undo = async (id: string) => {
    setStatus(null);
    try {
      await api.undoCorporate(id);
      setStatus("Kaydı geri aldım. Eski hâli kayıtta durur.");
      onChanged();
    } catch (err) {
      setStatus(errorMessage(err));
    }
  };

  if (!hasHoldings && !(book?.records.length ?? 0)) return null;
  const records = book?.records ?? [];
  const list = all ? records : records.slice(0, SHOWN);
  const title = !book ? "Kâr paylarına bakıyorum…" : book.total_try > 0 ? `Hisselerin sana toplam ${fmtLira(book.total_try, true)} kâr payı ödedi.` : "Hisselerin henüz sana kâr payı ödemedi.";

  return (
    <section aria-labelledby="kar-payi" className="om">
      <div className="om-head">
        <h2 id="kar-payi" className="u-chapter text-ink">
          {title}
        </h2>
        <p className="om-lead">
          Bir şirket kâr payı ya da bedelsiz pay verirse bankana geçer. Geçince buraya yaz; kâr payı kazancına eklenir, bedelsiz pay maliyetini değiştirmez. KAPtan para göndermez ve almaz.
        </p>
        {book && book.total_try > 0 ? <p className="cs-since">Bu yıl: {fmtLira(book.this_year_try, true)}. Başladığından beri kazancına dahil.</p> : null}
        {book && book.per_holding.length ? (
          <ul className="cs-per" aria-label="Hisse başına kâr payı">
            {book.per_holding.map((p) => (
              <li key={p.ticker}>
                {p.ticker}: <strong>{fmtLira(p.total_try, true)}</strong> kâr payı aldın. Bu yıl {fmtLira(p.this_year_try, true)}.
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <CorporatePrompt onChanged={onChanged} reloadKey={holdingsKey} />

      <div className="om-actions">
        {OPENERS.map((o) => (
          <Button
            key={o.kind}
            variant={panel === o.kind ? "primary" : "secondary"}
            size="lg"
            aria-expanded={panel === o.kind}
            onClick={(e) => {
              opener.current = e.currentTarget;
              setStatus(null);
              setPanel(o.kind);
            }}
          >
            {o.label}
          </Button>
        ))}
      </div>
      <p role="status" className="om-status">
        {status}
      </p>
      {panel ? <CorporateForm key={panel} kind={panel} onDone={close} onCancel={() => close(null)} /> : null}

      {records.length ? (
        <div className="om-log">
          <h3 className="u-caption">Yazdıkların</h3>
          <ol className="om-list">
            {list.map((r) => (
              <li key={r.id} className="om-item">
                <span className={r.undone ? "om-item-text--undone" : undefined}>{recordSentence(r)}</span>
                {r.undone ? <span className="om-item-note"> Geri alındı.</span> : null}
                {r.corrects === null && !r.undone ? (
                  <span className="om-item-actions">
                    <Button variant="link" onClick={() => void undo(r.id)} aria-label={`${r.ticker}: bu kaydı geri al`}>
                      Geri al
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          {records.length > SHOWN ? (
            <Button variant="link" aria-expanded={all} onClick={() => setAll((v) => !v)}>
              {all ? "Son birkaçını göster" : `Hepsini göster (${records.length})`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
