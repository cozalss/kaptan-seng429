"use client";

import { useEffect, useState } from "react";
import type { BackupStatus } from "@/lib/domain";
import { useApiMutation, useApiQuery } from "@/lib/api/react";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { WhatIs } from "@/components/help/what-is";
import "./comfort.css";

const POLL_MS = 2_000;

/** One sentence about the last backup, in the page's voice. */
export function backupSentence(status: BackupStatus | null): string {
  if (!status) return "Yedeğine bakılıyor.";
  if (status.state !== "idle") return "Yedek alınıyor.";
  if (status.last_ok === false) return "Son yedek alınamadı.";
  return status.last_at
    ? `Son yedek ${fmtDateTime(status.last_at)} tarihinde alındı.`
    : "Henüz yedek alınmadı.";
}

/**
 * Yedek: when the last backup was taken, where it goes, and "Şimdi yedek al". The backup service takes the
 * request within seconds; the box then reads the result.
 */
export function BackupSection() {
  const q = useApiQuery((api) => api.backupStatus(), []);
  const run = useApiMutation((api) => api.runBackup());
  const [now, setNow] = useState<BackupStatus | null>(null);
  const status = now ?? q.data ?? null;
  const busy = status !== null && status.state !== "idle";

  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(
      () => void q.refetch().then(() => setNow(null)),
      POLL_MS,
    );
    return () => clearTimeout(timer);
  });

  return (
    <section aria-labelledby="yedek-baslik" id="yedek" className="ay-block">
      <h2 id="yedek-baslik">
        <span className="pf-name">
          Yedek<span className="sr-only">. </span>
        </span>
        <span className="u-chapter block text-ink">
          {backupSentence(status)}
        </span>
      </h2>
      <p className="ay-block-lead">
        KAPtan her gün kendiliğinden yedek alır. Yedekler{" "}
        {status?.folder ? (
          <strong className="cf-path">{status.folder}</strong>
        ) : (
          "kurulumda seçtiğin klasöre"
        )}{" "}
        gider. <WhatIs term="yedek" />
      </p>
      <div className="cf-actions">
        <Button
          variant="secondary"
          pending={run.pending || busy}
          disabled={run.pending || busy}
          onClick={async () => {
            const done = await run.run();
            if (done) setNow(done);
          }}
        >
          {busy ? "Yedek alınıyor…" : "Şimdi yedek al"}
        </Button>
      </div>
      <p
        role="status"
        className="ay-result"
        data-ok={run.error || status?.last_ok === false ? "false" : "true"}
      >
        {run.error ?? q.error ?? status?.message_tr ?? ""}
      </p>
    </section>
  );
}
