"use client";

import { useEffect, useRef, useState } from "react";
import { ALERT_TOPICS, type AlertPrefs, type AlertTopic } from "@/lib/domain";
import { useApi, useApiQuery } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { defaultAlertPrefs, TOPIC_WORDS } from "@/lib/prefs/alert-defaults";
import { rememberAlertPrefs } from "@/lib/prefs/desktop-gate";
import { WhatIs } from "@/components/help/what-is";
import { announceSettingsChanged } from "./settings-events";
import { AdvancedFold } from "./settings-group";
import "./comfort.css";

type Saved = "idle" | "saving" | "saved" | "error";

/**
 * Hangi bildirim nereye: for each kind of message, on or off for the phone and e-mail and for this computer, and
 * the quiet hours (Istanbul time). Every change is saved at once; the phone never gets a company or an amount.
 */
export function AlertPrefsSection() {
  const api = useApi();
  const q = useApiQuery((a) => a.preferences(), []);
  const [prefs, setPrefs] = useState<AlertPrefs | null>(null);
  const [saved, setSaved] = useState<Saved>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const seq = useRef(0);
  const shown = prefs ?? q.data?.alerts ?? null;

  useEffect(() => {
    if (q.data) rememberAlertPrefs(q.data.alerts);
  }, [q.data]);

  const change = async (next: AlertPrefs) => {
    setPrefs(next);
    const mine = ++seq.current;
    setSaved("saving");
    try {
      const done = await api.saveAlertPrefs(next);
      if (mine !== seq.current) return;
      rememberAlertPrefs(done.alerts);
      announceSettingsChanged();
      setSaved("saved");
      setProblem(null);
    } catch (e) {
      if (mine !== seq.current) return;
      setSaved("error");
      setProblem(errorMessage(e));
    }
  };

  const toggle = (topic: AlertTopic, where: "phone" | "desktop") => {
    const base = shown ?? defaultAlertPrefs();
    void change({
      ...base,
      kinds: {
        ...base.kinds,
        [topic]: { ...base.kinds[topic], [where]: !base.kinds[topic][where] },
      },
    });
  };
  const setQuiet = (patch: Partial<AlertPrefs["quiet"]>) => {
    const base = shown ?? defaultAlertPrefs();
    void change({ ...base, quiet: { ...base.quiet, ...patch } });
  };

  return (
    <section
      aria-labelledby="bildirim-tercih"
      id="bildirim-tercih-bolum"
      className="ay-block"
    >
      <h2 id="bildirim-tercih">
        <span className="pf-name">
          Hangi bildirim nereye<span className="sr-only">. </span>
        </span>
        <span className="u-chapter block text-ink">
          Hangi haber nereye gelsin?
        </span>
      </h2>
      {shown ? (
        <>
          <ul aria-label="Bildirim türleri" className="ay-channels">
            {ALERT_TOPICS.filter((t) => t !== "weekly").map((topic) => (
              <li key={topic} className="cf-kind">
                <div className="min-w-0">
                  <h3 className="ay-channel-state">
                    {TOPIC_WORDS[topic].name}
                  </h3>
                  <p className="ay-channel-detail">{TOPIC_WORDS[topic].when}</p>
                </div>
                <div className="cf-checks">
                  <Check
                    label="Telefon ve e-posta"
                    aria={`${TOPIC_WORDS[topic].name}: telefon ve e-posta`}
                    on={shown.kinds[topic].phone}
                    onChange={() => toggle(topic, "phone")}
                  />
                  <Check
                    label="Bu bilgisayar"
                    aria={`${TOPIC_WORDS[topic].name}: bu bilgisayar`}
                    on={shown.kinds[topic].desktop}
                    onChange={() => toggle(topic, "desktop")}
                  />
                </div>
              </li>
            ))}
          </ul>
          <AdvancedFold>
            <ul aria-label="Haftalık özet" className="ay-channels">
              <li className="cf-kind">
                <div className="min-w-0">
                  <h3 className="ay-channel-state">{TOPIC_WORDS.weekly.name}</h3>
                  <p className="ay-channel-detail">{TOPIC_WORDS.weekly.when}</p>
                </div>
                <div className="cf-checks">
                  <Check
                    label="Telefon ve e-posta"
                    aria={`${TOPIC_WORDS.weekly.name}: telefon ve e-posta`}
                    on={shown.kinds.weekly.phone}
                    onChange={() => toggle("weekly", "phone")}
                  />
                </div>
              </li>
            </ul>
          </AdvancedFold>
          <fieldset className="cf-quiet">
            <legend className="ay-channel-state">
              Sessiz saatler <WhatIs term="sessiz-saatler" />
            </legend>
            <Check
              label="Bu saatlerde rahatsız etme"
              aria="Sessiz saatler"
              on={shown.quiet.on}
              onChange={() => setQuiet({ on: !shown.quiet.on })}
            />
            <div className="cf-row">
              <label className="cf-label" htmlFor="sessiz-bas">
                Başlangıç
              </label>
              <input
                id="sessiz-bas"
                type="time"
                className="cf-time"
                value={shown.quiet.start}
                disabled={!shown.quiet.on}
                onChange={(e) =>
                  e.target.value && setQuiet({ start: e.target.value })
                }
              />
              <label className="cf-label" htmlFor="sessiz-son">
                Bitiş
              </label>
              <input
                id="sessiz-son"
                type="time"
                className="cf-time"
                value={shown.quiet.end}
                disabled={!shown.quiet.on}
                onChange={(e) =>
                  e.target.value && setQuiet({ end: e.target.value })
                }
              />
            </div>
            <p className="ay-channel-detail">
              Saatler İstanbul saatidir. Bu saatlerde telefonuna haber gitmez, bekleyenler
              bitince gelir. Bu bilgisayarda hiç bildirim çıkmaz; öneri ana sayfanda seni bekler.
            </p>
          </fieldset>
        </>
      ) : q.error ? null : (
        <p className="ay-block-lead">Yükleniyor…</p>
      )}
      <p
        role="status"
        className="ay-result"
        data-ok={saved === "error" || q.error ? "false" : "true"}
      >
        {saved === "saving"
          ? "Kaydediliyor…"
          : saved === "saved"
            ? "Kaydedildi."
            : (problem ?? q.error ?? "")}
      </p>
    </section>
  );
}

function Check({
  label,
  aria,
  on,
  onChange,
}: {
  label: string;
  aria: string;
  on: boolean;
  onChange: () => void;
}) {
  return (
    <label className="cf-check">
      <input
        type="checkbox"
        checked={on}
        onChange={onChange}
        aria-label={aria}
      />
      <span>{label}</span>
    </label>
  );
}
