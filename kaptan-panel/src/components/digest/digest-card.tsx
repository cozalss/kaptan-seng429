"use client";

import "./digest.css";

import Link from "next/link";
import { useApiQuery } from "@/lib/api/react";
import { quietLine } from "@/lib/digest/digest";
import { ROUTES } from "@/lib/nav";
import { DigestRow } from "./digest-row";

const SHOWN = 5;

/**
 * "Bugün önemli duyurular": directly under the strip "Senin hisselerinde bugün". The strip already shows every
 * important disclosure of your companies, so this card lists only the others (no item twice), the first five, and
 * the way to all of them. Information, not a suggestion. Quiet and honest when nothing stands out.
 */
export function DigestCard({ limit = SHOWN, title = "Bugün önemli duyurular" }: { limit?: number; title?: string } = {}) {
  const q = useApiQuery((api) => api.digest(), []);
  const d = q.data;
  if (!d) return null;
  const others = d.items.filter((i) => i.why === null);
  const top = others.slice(0, limit);
  const quiet = others.length === 0 ? quietLine({ ...d, total: 0 }) : d.note;
  return (
    <section aria-labelledby="onemli-duyurular" className="dg-card u-page">
      <h2 id="onemli-duyurular" className="u-caption">
        {title}
      </h2>
      {quiet ? <p className="text-body text-ink-soft">{others.length === 0 && d.items.length > 0 ? "Başka şirketlerde dikkat çeken duyuru yok." : quiet}</p> : null}
      {top.length > 0 ? (
        <ul className="dg-list">
          {top.map((i) => (
            <DigestRow key={i.disclosure_index} item={i} showKind />
          ))}
        </ul>
      ) : null}
      <Link href={ROUTES.onemli} className="dg-link">
        {others.length > top.length ? `Hepsini gör (${d.total}) →` : "Önemli duyurulara git →"}
      </Link>
    </section>
  );
}
