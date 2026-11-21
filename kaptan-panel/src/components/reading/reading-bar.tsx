"use client";

import "./reading.css";

import { fmtInt } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useReadingMarks } from "./marks";

/**
 * Above the list in Okunanlar: how many duyuru of your companies you have not opened, the one button that
 * clears them, and the switch to the saved ones.
 */
export function ReadingBar({ saved, onSaved }: { saved: boolean; onSaved: (on: boolean) => void }) {
  const marks = useReadingMarks();
  if (!marks?.state) return null;
  const { unread, saved_indexes } = marks.state;
  return (
    <div className="rd-bar" role="group" aria-label="Okuma durumun">
      <p className="rd-count" role="status">
        {unread === 0 ? "Şirketlerindeki her duyuruyu gördün." : `Şirketlerinde ${fmtInt(unread)} duyuru seni bekliyor.`}
      </p>
      <div className="rd-actions">
        <Button variant="secondary" disabled={unread === 0} onClick={() => void marks.readAll()}>
          Hepsini okundu say
        </Button>
        <button type="button" className="rd-chip" aria-pressed={saved} onClick={() => onSaved(!saved)}>
          <span aria-hidden>★</span> Kaydedilenler ({fmtInt(saved_indexes.length)})
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
