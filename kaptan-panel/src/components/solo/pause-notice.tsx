"use client";

import "@/components/settings/comfort.css";

import { useEffect, useState } from "react";
import type { Pause } from "@/lib/domain";
import { useApiMutation, useOptionalApi } from "@/lib/api/react";
import { pauseNoticeSentence } from "@/lib/prefs/words";
import { Button } from "@/components/ui/button";

/**
 * The home says so while KAPtan is on Tatil modu: until when, what still happens and the way back. Renders
 * nothing when there is no pause (and when the API does not answer: the notice is a courtesy, not a gate).
 */
export function PauseNotice() {
  const api = useOptionalApi();
  const [pause, setPause] = useState<Pause | null>(null);
  const resume = useApiMutation((a) => a.endPause());

  useEffect(() => {
    let alive = true;
    if (!api) return;
    Promise.resolve()
      .then(() => api.preferences())
      .then(
        (p) => alive && setPause(p.pause),
        () => undefined,
      );
    return () => {
      alive = false;
    };
  }, [api]);

  if (!pause?.active || !pause.until) return null;
  return (
    <section aria-label="Tatil modu" className="u-page cf-notice">
      <p role="status" className="cf-notice-text">
        {pauseNoticeSentence(pause.until)}
      </p>
      <Button
        variant="primary"
        pending={resume.pending}
        disabled={resume.pending}
        onClick={async () => {
          const done = await resume.run();
          if (done) setPause(done.pause);
        }}
      >
        {resume.pending ? "Açılıyor…" : "Şimdi devam et"}
      </Button>
      {resume.error ? (
        <p role="alert" className="ay-result" data-ok="false">
          {resume.error}
        </p>
      ) : null}
    </section>
  );
}
