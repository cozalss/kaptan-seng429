"use client";

import { useState } from "react";
import { useDesk } from "@/components/shell/desk-state";
import { adviceFor, lastLook, needsRestartHint, RESTART_HOW, systemSentence, systemSummary, UNREACHABLE_NEXT } from "@/components/shell/system-words";
import { Button } from "@/components/ui/button";

/**
 * Sistem: is KAPtan itself working? The answer as one sentence, then everything it has to say
 * (each with what you can do about it), or one line that all is well with the time it last looked.
 */
export function SystemSection() {
  const { system, systemDown, refreshSystem } = useDesk();
  const [looking, setLooking] = useState(false);
  const look = async () => {
    setLooking(true);
    await refreshSystem();
    setLooking(false);
  };
  const problems = systemDown ? [] : (system?.problems ?? []);
  return (
    <section aria-labelledby="sistem-baslik" id="sistem" className="ay-block">
      <h2 id="sistem-baslik">
        <span className="pf-name">
          Sistem<span className="sr-only">. </span>
        </span>
        <span className="u-chapter block text-ink">{systemSentence(system, systemDown)}</span>
      </h2>
      {/* Always mounted: "Yeniden bak" changes its text, and that is read out. */}
      <div role="status" className="ay-system">
        {systemDown ? <p className="ay-block-lead">{UNREACHABLE_NEXT}</p> : null}
        {!systemDown && system && problems.length === 0 ? <p className="ay-block-lead">{systemSummary(system)}</p> : null}
        {problems.length ? (
          <>
            <ul aria-label="KAPtan’ın söyledikleri" className="ay-problems">
              {problems.map((p) => (
                <li key={p.code} className="ay-problem">
                  <p className="ay-channel-state">{p.message}</p>
                  <p className="ay-channel-detail">{adviceFor(p.code)}</p>
                </li>
              ))}
            </ul>
            {system && needsRestartHint(system) ? <p className="ay-channel-detail mt-3">{RESTART_HOW}</p> : null}
            {system ? <p className="ay-channel-detail mt-3 tabular-nums">{lastLook(system)}</p> : null}
          </>
        ) : null}
      </div>
      <Button variant="secondary" className="mt-4" pending={looking} disabled={looking} onClick={() => void look()}>
        {looking ? "Bakılıyor…" : "Yeniden bak"}
      </Button>
    </section>
  );
}
