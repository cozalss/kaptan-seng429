"use client";

import "./help.css";

import { useEffect, useId, useState } from "react";
import { openHowItWorks, STEPS } from "@/components/onboarding/how-it-works";
import { PageHeader } from "@/components/shell/page-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { FAQ } from "./faq";
import { glossaryAnchor, searchGlossary } from "./glossary";
import { SHORTCUTS } from "@/components/shell/shortcut-list";

/** Brings the entry a link points to (/yardim#sozluk-komisyon) into view, opening the question it sits in. */
function useHashTarget() {
  useEffect(() => {
    const show = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (!el) return;
      const details = el.closest("details");
      if (details) details.open = true;
      el.scrollIntoView({ block: "center" });
      el.focus({ preventScroll: true });
    };
    const first = setTimeout(show, 0);
    window.addEventListener("hashchange", show);
    return () => {
      clearTimeout(first);
      window.removeEventListener("hashchange", show);
    };
  }, []);
}

/** /yardim: how KAPtan works, the questions people ask first, every finance word in one line, the shortcuts. */
export function HelpScreen() {
  useHashTarget();
  return (
    <div className="yd-screen">
      <PageHeader
        name="Yardım"
        title="Takıldığın yer burada çözülür."
        lead="Nasıl çalıştığını, sık sorulanları ve bütün para kelimelerinin ne demek olduğunu bulursun."
      />
      <HowSection />
      <FaqSection />
      <GlossarySection />
      <ShortcutsSection />
    </div>
  );
}

function HowSection() {
  return (
    <section aria-labelledby="yd-nasil" className="yd-block">
      <h2 id="yd-nasil" className="u-chapter text-ink">
        KAPtan nasıl çalışır?
      </h2>
      <ol className="yd-steps">
        {STEPS.map((step, i) => (
          <li key={step.title} className="yd-step">
            <span aria-hidden className="yd-step-n">
              {i + 1}
            </span>
            <div>
              <h3 className="yd-step-title">{step.title}</h3>
              <p className="yd-text">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <Button variant="secondary" className="mt-4" onClick={openHowItWorks}>
        Resimli anlatımı aç
      </Button>
    </section>
  );
}

function FaqSection() {
  return (
    <section aria-labelledby="yd-sss" className="yd-block">
      <h2 id="yd-sss" className="u-chapter text-ink">
        Sık sorulanlar
      </h2>
      <div className="yd-faq">
        {FAQ.map((q) => (
          <details key={q.id} id={`soru-${q.id}`} className="yd-q">
            <summary className="yd-q-sum">{q.question}</summary>
            <div className="yd-q-body">
              {q.answer.map((p) => (
                <p key={p} className="yd-text">
                  {p}
                </p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function GlossarySection() {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const entries = searchGlossary(query);
  return (
    <section aria-labelledby="yd-sozluk" className="yd-block">
      <h2 id="yd-sozluk" className="u-chapter text-ink">
        Sözlük
      </h2>
      <p className="yd-text mt-2">
        KAPtan’da geçen her para kelimesi, tek cümleyle.
      </p>
      <div className="yd-search">
        <label htmlFor={searchId} className="yd-search-label">
          Kelime ara
        </label>
        <Input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="örneğin: komisyon"
          autoComplete="off"
        />
      </div>
      <p role="status" className="yd-count">
        {entries.length === 0
          ? "Bu kelimeyi bulamadım."
          : `${entries.length} kelime`}
      </p>
      <dl className="yd-gloss">
        {entries.map((e) => (
          <div
            key={e.id}
            id={glossaryAnchor(e.id)}
            tabIndex={-1}
            className="yd-term"
          >
            <dt className="yd-term-name">{e.term}</dt>
            <dd className="yd-term-text">{e.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ShortcutsSection() {
  return (
    <section aria-labelledby="yd-kisayol" className="yd-block">
      <h2 id="yd-kisayol" className="u-chapter text-ink">
        Klavye kısayolları
      </h2>
      <p className="yd-text mt-2">
        Her yerde <kbd className="yd-key">?</kbd> tuşu bu listeyi açar.
      </p>
      <ul className="yd-shortcuts">
        {SHORTCUTS.map((s) => (
          <li key={s.label} className="yd-shortcut">
            <span className="yd-keys">
              {s.keys.map((k, i) => (
                <kbd key={`${i}-${k}`} className="yd-key">
                  {k}
                </kbd>
              ))}
            </span>
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
