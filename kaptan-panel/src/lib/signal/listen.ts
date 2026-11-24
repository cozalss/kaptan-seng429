"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * "Dinle": reads lines aloud with the browser's own Web Speech API (tr-TR, no server, no cost). The button is
 * hidden when the browser has no Turkish voice. Pausable. Nothing leaves the computer.
 */
const synth = (): SpeechSynthesis | null => (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null);

/** The first Turkish voice, or null. */
export function turkishVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return voices.find((v) => v.lang.toLowerCase().replace("_", "-").startsWith("tr")) ?? null;
}

function subscribe(fn: () => void): () => void {
  const s = synth();
  if (!s) return () => undefined;
  s.addEventListener("voiceschanged", fn);
  return () => s.removeEventListener("voiceschanged", fn);
}

/** True when this browser can read Turkish aloud (voices load late in some browsers, so it is a subscription). */
export function useTurkishVoice(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => {
      const s = synth();
      return s !== null && turkishVoice(s.getVoices()) !== null;
    },
    () => false,
  );
}

export type ListenState = "idle" | "playing" | "paused";

export function useListen(lines: readonly string[]): { state: ListenState; start: () => void; pause: () => void; resume: () => void; stop: () => void } {
  const [state, setState] = useState<ListenState>("idle");
  const run = useRef(0);
  const stop = useCallback(() => {
    run.current += 1;
    synth()?.cancel();
    setState("idle");
  }, []);
  useEffect(() => () => void synth()?.cancel(), []);
  const start = useCallback(() => {
    const s = synth();
    if (!s || lines.length === 0) return;
    s.cancel();
    const mine = (run.current += 1);
    const voice = turkishVoice(s.getVoices());
    lines.forEach((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "tr-TR";
      if (voice) u.voice = voice;
      u.onend = () => {
        if (i === lines.length - 1 && run.current === mine) setState("idle");
      };
      u.onerror = () => {
        if (run.current === mine) setState("idle");
      };
      s.speak(u);
    });
    setState("playing");
  }, [lines]);
  const pause = useCallback(() => {
    synth()?.pause();
    setState("paused");
  }, []);
  const resume = useCallback(() => {
    synth()?.resume();
    setState("playing");
  }, []);
  return { state, start, pause, resume, stop };
}
