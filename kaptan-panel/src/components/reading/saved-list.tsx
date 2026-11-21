"use client";

import { useEffect } from "react";
import { useApiQuery } from "@/lib/api/react";
import { ScreenState } from "@/components/shell/page-frame";
import { DisclosureHours } from "@/components/disclosures/disclosure-rows";
import { useReadingMarks } from "./marks";

const NO_CARDS = new Map();

/** The disclosures you saved for later, newest save first. */
export function SavedList({ onOpen }: { onOpen: (index: number) => void }) {
  const marks = useReadingMarks();
  const q = useApiQuery((api) => api.savedDisclosures(), []);
  const count = marks?.state?.saved_indexes.length;
  const { refetch } = q;
  useEffect(() => {
    void refetch();
  }, [count, refetch]);
  if (q.error && !q.data) {
    return (
      <ScreenState kind="error" title="Kaydettiklerini getiremedim." onRetry={q.refetch}>
        {q.error}
      </ScreenState>
    );
  }
  if (!q.data) return <ScreenState kind="loading" title="Kaydettiklerini getiriyorum…" />;
  if (q.data.length === 0) {
    return (
      <ScreenState kind="empty" title="Henüz bir şey kaydetmedin.">
        Bir duyurunun yanındaki “Sonra oku” yıldızına bas; burada seni bekler.
      </ScreenState>
    );
  }
  return <DisclosureHours rows={q.data} label="Kaydedilen duyurular" cardOf={NO_CARDS} onOpen={onOpen} />;
}
