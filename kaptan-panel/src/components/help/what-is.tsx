import Link from "next/link";
import { ROUTES } from "@/lib/nav";
import { glossaryAnchor, GLOSSARY } from "./glossary";

/**
 * A small "ne demek?" beside a finance word: it opens that word's line in Yardım. The visible text stays short;
 * the accessible name says which word.
 */
export function WhatIs({ term }: { term: string }) {
  const entry = GLOSSARY.find((e) => e.id === term);
  if (!entry) return null;
  return (
    <Link
      href={`${ROUTES.yardim}#${glossaryAnchor(term)}`}
      className="what-is"
      aria-label={`${entry.term} ne demek?`}
    >
      ne demek?
    </Link>
  );
}
