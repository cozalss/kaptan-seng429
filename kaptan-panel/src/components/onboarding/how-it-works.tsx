"use client";

import "@/components/ufuk/ufuk.css";
import "./onboarding.css";

import { Dialog as D } from "radix-ui";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { StepDecide, StepRead, StepSift } from "./illustrations";
import { hasSeenHowTo, markHowToSeen } from "./seen";

const OPEN_EVENT = "kaptan:how-it-works";

/** Opens "KAPtan nasıl çalışır" from anywhere (Ayarlar's button), wherever <HowItWorks /> is mounted. */
export function openHowItWorks(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const STEPS = [
  {
    title: "KAPtan okur.",
    text: "Borsadaki şirketler her gün yüzlerce duyuru yapar. KAPtan hepsini senin yerine okur; sen okumak zorunda kalmazsın.",
    Picture: StepRead,
  },
  {
    title: "Kurallar süzer.",
    text: "Önceden yazılmış kurallar çoğunu eler. Geriye yalnızca işine yarayabilecek birkaç tanesi kalır; KAPtan her birinin nedenini ve belirsizliğini söyler.",
    Picture: StepSift,
  },
  {
    title: "Sen karar verirsin.",
    text: "KAPtan kendi başına asla alıp satmaz. Onaylarsan işlemi bankana sen girersin. İstemezsen geçersin; hiçbir şey olmaz.",
    Picture: StepDecide,
  },
] as const;

/**
 * "KAPtan nasıl çalışır": three short illustrated steps. Mount it once inside the app: it shows
 * itself on this browser's first visit, is skippable and remembered, and `openHowItWorks()` brings
 * it back. Focus stays inside while open (Radix), arrow keys turn the pages, Esc skips.
 */
export function HowItWorks() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    // After mount: the server cannot know what this browser remembers.
    const first = setTimeout(() => {
      if (!hasSeenHowTo(window.localStorage)) setOpen(true);
    }, 0);
    const show = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      clearTimeout(first);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, []);

  const close = useCallback(() => {
    markHowToSeen(window.localStorage);
    setOpen(false);
  }, []);

  const go = useCallback((next: number) => {
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
    // The heading is the page: a screen reader starts reading there on every step.
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }, []);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") go(step + 1);
    if (e.key === "ArrowLeft") go(step - 1);
  };

  const current = STEPS[step] ?? STEPS[0];
  const last = step === STEPS.length - 1;
  const Picture = current.Picture;

  return (
    <D.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <D.Portal>
        <D.Overlay className="hw-overlay" />
        <D.Content
          className="hw-sheet"
          aria-describedby="hw-text"
          onKeyDown={onKey}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            heading.current?.focus({ preventScroll: true });
          }}
        >
          <div className="hw-top">
            <p className="hw-name">KAPtan nasıl çalışır</p>
            <Button variant="ghost" onClick={close}>
              Geç
            </Button>
          </div>
          <div key={step} className="hw-picture" aria-hidden>
            <Picture />
          </div>
          <div aria-hidden className="hw-water" />
          <div className="hw-body">
            <p className="hw-count">
              {step + 1}. adım, {STEPS.length} adımdan
            </p>
            <D.Title asChild>
              <h2 ref={heading} tabIndex={-1} className="u-sentence hw-title">
                {current.title}
              </h2>
            </D.Title>
            <D.Description id="hw-text" className="hw-text">
              {current.text}
            </D.Description>
            <div className="hw-nav">
              <div className="hw-pips" aria-hidden>
                {STEPS.map((s, i) => (
                  <span key={s.title} data-on={i === step || undefined} className="hw-pip" />
                ))}
              </div>
              <div className="flex gap-2">
                {step > 0 ? (
                  <Button variant="outline" size="lg" onClick={() => go(step - 1)}>
                    Geri
                  </Button>
                ) : null}
                {last ? (
                  <Button variant="primary" size="lg" onClick={close}>
                    Anladım
                  </Button>
                ) : (
                  <Button variant="primary" size="lg" onClick={() => go(step + 1)}>
                    Devam
                  </Button>
                )}
              </div>
            </div>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
