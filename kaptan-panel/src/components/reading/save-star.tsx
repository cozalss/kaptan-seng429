"use client";

import "./reading.css";

import { useReadingMarks } from "./marks";

/** "Sonra oku": a star on one disclosure. Saved ones wait under "Kaydedilenler" in Okunanlar. */
export function SaveStar({ index, label }: { index: number; label: string }) {
  const marks = useReadingMarks();
  if (!marks) return null;
  const saved = marks.isSaved(index);
  return (
    <button
      type="button"
      className="rd-star"
      aria-pressed={saved}
      aria-label={`${label}: sonra okumak için ${saved ? "işareti kaldır" : "kaydet"}`}
      onClick={() => void marks.toggleSaved(index)}
    >
      <span aria-hidden>{saved ? "★" : "☆"}</span>
      <span className="rd-star-word">{saved ? "Kaydedildi" : "Sonra oku"}</span>
    </button>
  );
}

/** A small "Yeni" mark for a disclosure of your companies that you have not opened. */
export function NewMark({ index }: { index: number }) {
  const marks = useReadingMarks();
  if (!marks?.isUnread(index)) return null;
  return <span className="rd-new">Yeni</span>;
}
