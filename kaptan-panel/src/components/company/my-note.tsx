"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/api/react";
import { ROUTES } from "@/lib/nav";

/** The person's own private note on this share ("neden aldım"), read-only; it is written in Param. Nothing if none. */
export function MyNote({ ticker }: { ticker: string }) {
  const q = useApiQuery((api) => api.holdingNotes(), []);
  const note = q.data?.notes.find((n) => n.ticker === ticker);
  if (!note) return null;
  return (
    <section aria-labelledby="co-notum" className="co-sec">
      <h2 id="co-notum" className="u-chapter text-ink">
        Notum
      </h2>
      <p className="co-lead">{note.body}</p>
      <Link href={ROUTES.portfoy} className="co-link">
        Notu Param’da değiştir →
      </Link>
    </section>
  );
}
