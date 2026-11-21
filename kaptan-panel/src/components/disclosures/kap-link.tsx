"use client";

import type { DisclosureListItem } from "@/lib/domain";
import { useReadingMarks } from "@/components/reading/marks";
import { shortName } from "@/components/story/plain";
import { titleTr } from "@/components/story/turkish";
import { kapUrl } from "./reading-words";

/** A link to the disclosure's own page at KAP, the official source. Opening it there counts it as read here. */
export function KapLink({ d }: { d: DisclosureListItem }) {
  const marks = useReadingMarks();
  const url = kapUrl(d);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${titleTr(shortName(d.company_name))} duyurusunu KAP’ta aç (yeni sekmede)`}
      className="ok-kap"
      onClick={() => void marks?.open(d.disclosure_index)}
    >
      KAP’ta aç <span aria-hidden>↗</span>
    </a>
  );
}
