"use client";

import "./signal.css";

import { Button } from "@/components/ui/button";
import { useListen, useTurkishVoice } from "@/lib/signal/listen";

/** "Dinle": reads the given lines aloud in Turkish with the browser's own voice; pausable; hidden without a Turkish voice. */
export function ListenButton({ lines, label = "Dinle" }: { lines: readonly string[]; label?: string }) {
  const hasVoice = useTurkishVoice();
  const { state, start, pause, resume, stop } = useListen(lines);
  if (!hasVoice || lines.length === 0) return null;
  return (
    <span className="sg-listen" role="group" aria-label="Sesli okuma">
      {state === "idle" ? (
        <Button variant="secondary" size="sm" onClick={start}>
          <span aria-hidden>🔊</span> {label}
        </Button>
      ) : (
        <>
          <Button variant="secondary" size="sm" onClick={state === "playing" ? pause : resume}>
            {state === "playing" ? "Duraklat" : "Devam et"}
          </Button>
          <Button variant="ghost" size="sm" onClick={stop}>
            Durdur
          </Button>
        </>
      )}
    </span>
  );
}
