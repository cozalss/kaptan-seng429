"use client";

import "./reading.css";

import { fmtInt } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useReadingMarks } from "./marks";

/**
 * Above the list in Okunanlar, one short row: how many IMPORTANT duyuru of your companies you have not looked at
 * (the same number as the badge in the bar), what is waiting to be done, the one button that clears the important
 * ones too (noise and archive-only are read from the start), its "Geri al", and the switch to the saved ones.
 */
export function ReadingBar({ saved, onSaved }: { saved: boolean; onSaved: (on: boolean) => void }) {
  const marks = useReadingMarks();
  if (!marks?.state) return null;
  const { unread, saved_indexes, act_count } = marks.state;
  return (
    <div className="rd-bar" role="group" aria-label="Okuma durumun">
      <p className="rd-count" role="status">
        {unread === 0 ? "Önemli her duyuruya baktın." : `${fmtInt(unread)} önemli duyuru bekliyor.`}
        {act_count > 0 ? ` Yapılacak: ${fmtInt(act_count)}.` : ""}
      </p>
      <div className="rd-actions">
        <Button variant="secondary" disabled={unread === 0} onClick={() => void marks.readAll(true)}>
          Önemlileri de okundu say
        </Button>
        {marks.undoReadAll ? (
          <Button variant="ghost" onClick={() => void marks.undoReadAll?.()}>
            Geri al
          </Button>
        ) : null}
        <button type="button" className="rd-chip" aria-pressed={saved} onClick={() => onSaved(!saved)}>
          <span aria-hidden>★</span> Sonra oku ({fmtInt(saved_indexes.length)})
        </button>
      </div>
      {marks.error ? (
        <p role="alert" className="text-dense text-loss">
          {marks.error}
        </p>
      ) : null}
    </div>
  );
}
