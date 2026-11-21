"use client";

import "./digest.css";

import Link from "next/link";
import { useApiQuery } from "@/lib/api/react";
import { quietLine } from "@/lib/digest/digest";
import { ROUTES } from "@/lib/nav";
import { DigestRow } from "./digest-row";

const SHOWN = 5;

/**
 * "Bugün önemli duyurular": the first five of the day's digest (yours first), and the way to all of them.
 * Information, not a suggestion. Quiet and honest when nothing stands out or the market is closed.
 */
export function DigestCard() {
  const q = useApiQuery((api) => api.digest(), []);
  const d = q.data;
  if (!d) return null;
  const top = d.items.slice(0, SHOWN);
  const quiet = quietLine(d);
  return (
    <section aria-labelledby="onemli-duyurular" className="dg-card">
      <h2 id="onemli-duyurular" className="u-caption">
        Bugün önemli duyurular
      </h2>
      {quiet ? <p className="text-body text-ink-soft">{quiet}</p> : null}
      {top.length > 0 ? (
        <ul className="dg-list">
          {top.map((i) => (
            <DigestRow key={i.disclosure_index} item={i} showKind />
          ))}
        </ul>
      ) : null}
      <Link href={ROUTES.onemli} className="dg-link">
        {d.total > top.length ? `Hepsini gör (${d.total}) →` : "Önemli duyurulara git →"}
      </Link>
    </section>
  );
}
