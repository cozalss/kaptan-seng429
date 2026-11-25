"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import "./groups.css";

/** True when the page address points at something inside `el` (an old link such as #telegram or #sistem). */
function addressPointsInside(el: HTMLElement): boolean {
  const hash = window.location.hash.slice(1);
  if (!hash) return false;
  const target = document.getElementById(decodeURIComponent(hash));
  return target !== null && el.contains(target);
}

function useOpenForAddress(body: React.RefObject<HTMLElement | null>, open: boolean, onOpenChange: (open: boolean) => void, extra = false) {
  useEffect(() => {
    const check = () => {
      if (open || !body.current) return;
      if (extra || addressPointsInside(body.current)) {
        onOpenChange(true);
        const hash = window.location.hash.slice(1);
        if (hash) requestAnimationFrame(() => document.getElementById(decodeURIComponent(hash))?.scrollIntoView());
      }
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [body, open, onOpenChange, extra]);
}

interface GroupProps {
  id: string;
  name: string;
  /** One line: what is set right now. */
  summary: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open at once (e.g. the page was reached from a company page with ?sustur=). */
  openFor?: boolean;
  children: ReactNode;
}

/** A big plain group of Ayarlar: its name, one line of what is set now, and the details behind "Değiştir". */
export function SettingsGroup({ id, name, summary, open, onOpenChange, openFor = false, children }: GroupProps) {
  const body = useRef<HTMLDivElement>(null);
  const bodyId = useId();
  useOpenForAddress(body, open, onOpenChange, openFor);
  return (
    <section aria-labelledby={`${id}-baslik`} id={id} className="ay-group" data-testid={`grup-${id}`}>
      <div className="ay-group-head">
        <div className="min-w-0">
          <h2 id={`${id}-baslik`} className="ay-group-name">
            {name}
          </h2>
          <p className="ay-group-sum" data-testid={`ozet-${id}`}>
            {summary}
          </p>
        </div>
        <Button
          variant="secondary"
          className="ay-group-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${name}: ${open ? "kapat" : "değiştir"}`}
          data-fold="group"
          onClick={() => onOpenChange(!open)}
        >
          {open ? "Kapat" : "Değiştir"}
        </Button>
      </div>
      <div id={bodyId} ref={body} hidden={!open} className="ay-group-body">
        {children}
      </div>
    </section>
  );
}

/** "Gelişmiş": the rarely used controls of a group, folded away. */
export function AdvancedFold({ label = "Gelişmiş", children }: { label?: string; children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  useOpenForAddress(body, open, setOpen);
  return (
    <div className="ay-adv">
      <button
        type="button"
        className="ay-adv-btn"
        aria-expanded={open}
        aria-controls={bodyId}
        data-fold="advanced"
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      <div id={bodyId} ref={body} hidden={!open} className="ay-adv-body">
        {children}
      </div>
    </div>
  );
}
