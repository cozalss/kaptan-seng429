"use client";

import "./reading.css";

import { fmtInt } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useReadingMarks } from "./marks";

/**
 * Above the list in Okunanlar: how many duyuru of your companies (starred or held) you have not opened, the
 * same number as the badge in the bar; the one button that clears them, its "Geri al", and the switch to the
 * saved ones. Opening a duyuru (here or at KAP) counts it as read.
 */
export function ReadingBar({ saved, onSaved }: { saved: boolean; onSaved: (on: boolean) => void }) {
  const marks = useReadingMarks();
  if (!marks?.state) return null;
  const { unread, saved_indexes } = marks.state;
  return (
    <div className="rd-bar" role="group" aria-label="Okuma durumun">
      <p className="rd-count" role="status">
        {unread === 0
          ? "Şirketlerindeki her duyuruyu gördün."
          : `İzlediğin ve elindeki şirketlerde ${fmtInt(unread)} okunmamış duyuru var. Birini açınca okundu sayılır.`}
      </p>
      <div className="rd-actions">
        <Button variant="secondary" disabled={unread === 0} onClick={() => void marks.readAll()}>
          Hepsini okundu say
        </Button>
        {marks.undoReadAll ? (
          <Button variant="ghost" onClick={() => void marks.undoReadAll?.()}>
            Geri al
          </Button>
        ) : null}
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
