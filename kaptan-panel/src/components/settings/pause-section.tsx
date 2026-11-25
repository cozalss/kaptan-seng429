"use client";

import { useState } from "react";
import type { Preferences } from "@/lib/domain";
import { useApiMutation, useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import {
  pauseEndWords,
  QUICK_PAUSE_DAYS,
  tomorrowIso,
} from "@/lib/prefs/words";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { WhatIs } from "@/components/help/what-is";
import { announceSettingsChanged } from "./settings-events";
import "./comfort.css";

type Start = { days: number } | { until: string };

/**
 * Tatil modu: ask KAPtan for no suggestions for a few days or until a date. It still reads and keeps every
 * notice, spends no quota and makes no suggestion. Shows the end and the way back.
 */
export function PauseSection() {
  const q = useApiQuery((api) => api.preferences(), []);
  const start = useApiMutation((api, input: Start) => api.startPause(input));
  const stop = useApiMutation((api) => api.endPause());
  const [now, setNow] = useState<Preferences | null>(null);
  const [date, setDate] = useState("");
  // null until mounted: the server cannot know this browser's (or the test double's) clock.
  const clock = useNow(60_000);
  const earliest = clock === null ? undefined : tomorrowIso(clock);
  const pause = (now ?? q.data ?? null)?.pause ?? null;
  const error = start.error ?? stop.error ?? q.error;

  const begin = async (input: Start) => {
    const done = await start.run(input);
    if (done) {
      setNow(done);
      announceSettingsChanged();
    }
  };
  const resume = async () => {
    const done = await stop.run();
    if (done) {
      setNow(done);
      announceSettingsChanged();
    }
  };

  return (
    <section aria-labelledby="tatil-baslik" id="tatil" className="ay-block">
      <h2 id="tatil-baslik">
        <span className="pf-name">
          Tatil modu<span className="sr-only">. </span>
        </span>
        <span className="u-chapter block text-ink">
          {pause?.active && pause.until
            ? `Tatil modu açık. Bitiş: ${pauseEndWords(pause.until)}.`
            : "KAPtan şu an öneri getiriyor."}
        </span>
      </h2>
      <p className="ay-block-lead">
        Tatildeysen ya da bir süre öneri istemiyorsan KAPtan’a ara ver.
        Bildirimleri okumaya ve saklamaya devam eder; öneri çıkarmaz ve ücretsiz
        kotanı harcamaz.{" "}
        <WhatIs term="tatil-modu" />
      </p>

      {pause?.active ? (
        <div className="cf-actions">
          {pause.since ? (
            <p className="ay-channel-detail">
              Ara verdiğin gün: {fmtDate(pause.since)}.
            </p>
          ) : null}
          <Button
            variant="primary"
            pending={stop.pending}
            disabled={stop.pending}
            onClick={() => void resume()}
          >
            {stop.pending ? "Açılıyor…" : "Şimdi devam et"}
          </Button>
        </div>
      ) : (
        <div className="cf-actions">
          <div
            className="cf-chips"
            role="group"
            aria-label="Kaç gün ara verilsin"
          >
            {QUICK_PAUSE_DAYS.map((days) => (
              <Button
                key={days}
                variant="secondary"
                disabled={start.pending}
                onClick={() => void begin({ days })}
              >
                {days} gün ara ver
              </Button>
            ))}
          </div>
          <form
            className="cf-inline"
            onSubmit={(e) => {
              e.preventDefault();
              if (date) void begin({ until: date });
            }}
          >
            <label htmlFor="tatil-tarih" className="cf-label">
              Ya da şu tarihte devam etsin
            </label>
            <div className="cf-row">
              <Input
                id="tatil-tarih"
                type="date"
                value={date}
                min={earliest}
                onChange={(e) => setDate(e.target.value)}
                className="cf-date"
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={!date || start.pending}
                pending={start.pending}
              >
                Ara ver
              </Button>
            </div>
          </form>
        </div>
      )}
      <p role="status" className="ay-result" data-ok={error ? "false" : "true"}>
        {error ?? ""}
      </p>
    </section>
  );
}
