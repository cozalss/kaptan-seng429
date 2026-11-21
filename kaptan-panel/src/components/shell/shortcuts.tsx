"use client";

import "@/components/help/help.css";
import "@/components/onboarding/onboarding.css";

import { Dialog as D } from "radix-ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IDLE, SHORTCUTS, step, type ChordState } from "./shortcut-list";

const OPEN_EVENT = "kaptan:shortcuts";

/** Opens the list of shortcuts from anywhere (the account menu), wherever <Shortcuts /> is mounted. */
export function openShortcuts(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/** Mount once inside the app: "g" and a letter go to a screen, "?" lists them. Never while typing. */
export function Shortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const chord = useRef<ChordState>(IDLE);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A dialog already open (the how-it-works sheet, a confirmation) owns the keyboard.
      const dialogOpen = document.querySelector('[role="dialog"]') !== null;
      const next = step(chord.current, {
        key: e.key,
        modified: e.ctrlKey || e.altKey || e.metaKey,
        typing: isTyping(e.target) || dialogOpen,
        now: Date.now(),
      });
      chord.current = next.state;
      if (next.action?.kind === "go") router.push(next.action.path);
      if (next.action?.kind === "help") setOpen(true);
    };
    const show = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, [router]);

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="hw-overlay" />
        <D.Content className="ks-sheet" aria-describedby={undefined}>
          <D.Title className="ks-title">Klavye kısayolları</D.Title>
          <ul className="yd-shortcuts">
            {SHORTCUTS.map((s) => (
              <li key={s.label} className="yd-shortcut">
                <span className="yd-keys">
                  {s.keys.map((k, i) => (
                    <span key={`${k}${i}`} className="yd-keys">
                      {i > 0 ? <span className="yd-then">sonra</span> : null}
                      <kbd className="yd-key">{k}</kbd>
                    </span>
                  ))}
                </span>
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
          <D.Close asChild>
            <Button variant="secondary" className="mt-4">
              Kapat
            </Button>
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
