"use client";

import "./audit.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { fmtInt } from "@/lib/format";
import { istanbulDay } from "@/lib/session-day";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { prefersReducedMotion } from "@/lib/utils";
import { PageHeader, ScreenState } from "@/components/shell/page-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useChainWalk } from "./chain-walk";
import { historySentence, type Scope } from "./diary-words";
import { rowId, Diary } from "./ledger";
import { VerifyBand } from "./verify-panel";

/** Records shown at first; "Daha eskisini göster" adds as many again (the API caps at 500). */
const PAGE = 30;
const MAX = 500;

/**
 * /gecmis: everything that happened as a diary, grouped by day, in two voices (Sen and KAPtan), and
 * one button that walks the whole chain and says whether anything was changed afterwards.
 */
export function AuditScreen() {
  const [scope, setScope] = useState<Scope>("today");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const now = useNow(60_000);
  const today = now === null ? null : istanbulDay(now);
  // The record "Kaydı göster" asked for, until the list holds it.
  const target = useRef<number | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 200);
    return () => clearTimeout(id);
  }, [search]);

  const list = useApiQuery((api) => api.auditList({ scope, q: q || undefined, limit }), [scope, q, limit]);
  const { walk, verify } = useChainWalk(list.data?.length ?? 0);
  // New records arrive with every counter tick (KAPtan keeps reading) and every decision.
  useEventStream("feed", { counters: () => void list.refetch() });
  useEventStream("desk", {
    "approval.decided": () => void list.refetch(),
    kill_switch: () => void list.refetch(),
    "limits.changed": () => void list.refetch(),
  });

  // "Kaydı göster": once the list holds the record, bring it into view and focus it.
  useEffect(() => {
    const pos = target.current;
    const row = pos === null ? null : document.getElementById(rowId(pos));
    if (!row) return;
    target.current = null;
    row.setAttribute("tabindex", "-1");
    if (typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    row.focus({ preventScroll: true });
  }, [list.data]);

  const showRecord = useCallback((pos: number) => {
    target.current = pos;
    setScope("all");
    setLimit(PAGE);
    setSearch(`#${pos}`);
  }, []);

  const broken = walk.phase === "done" && !walk.result.ok ? walk.result.first_bad_pos : null;
  const data = list.data;
  const more = data !== undefined && data.items.length < data.total && limit < MAX;
  // Asked for more than we hold and the list is fetching: the button says so (it stays put).
  const growing = list.refreshing && data !== undefined && data.items.length < Math.min(limit, data.total);
  const sentence = data ? historySentence({ scope, total: data.total, searching: q.length > 0 }) : list.error ? "Günlüğü şu an açamadım." : "Günlüğü açıyorum…";

  return (
    <div className="gc-screen">
      <PageHeader name="Geçmiş" title={sentence} lead="Olan her şey sırayla buraya yazılır: sen ne yaptın, KAPtan ne yaptı. Bir kayıt sonradan değiştirilirse anlaşılır." />

      <VerifyBand walk={walk} onVerify={() => void verify()} onShow={showRecord} />

      <div className="gc-tools">
        <div role="group" aria-label="Hangi günler" className="gc-scope">
          {(["today", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scope === s}
              onClick={() => {
                setScope(s);
                setLimit(PAGE);
              }}
              className="gc-scope-btn"
            >
              {s === "today" ? "Bugün" : "Tümü"}
            </button>
          ))}
        </div>
        <label className="block w-full sm:w-[280px]">
          <span className="sr-only">Geçmişte ara</span>
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ara: şirket adı, onayladın…" />
        </label>
      </div>

      {list.error && !data ? (
        <ScreenState kind="error" title="Kayıtlara ulaşamadım." onRetry={list.refetch}>
          {list.error} Kayıtlar yerinde; yalnızca şu an gösteremiyorum.
        </ScreenState>
      ) : null}

      {data ? (
        <>
          {data.items.length ? (
            <Diary items={data.items} broken={broken} today={today} />
          ) : q ? (
            <ScreenState
              kind="empty"
              title="Bu aramaya uyan kayıt yok."
              action={
                <Button variant="secondary" onClick={() => setSearch("")}>
                  Aramayı temizle
                </Button>
              }
            >
              Şirketin adını ya da yaptığın işi yazabilirsin.
            </ScreenState>
          ) : (
            <ScreenState
              kind="empty"
              title="Bugün henüz bir şey yazılmadı."
              action={
                <Button variant="secondary" onClick={() => setScope("all")}>
                  Eski günlere bak
                </Button>
              }
            >
              KAPtan okumaya başlayınca ya da sen bir şey yapınca burası dolar.
            </ScreenState>
          )}
          <div className="gc-more">
            <p role="status" aria-live="polite" className="text-dense text-muted tabular-nums">
              {data.items.length < data.total ? `En yeni ${fmtInt(data.items.length)} kayıt burada; bu görünümde ${fmtInt(data.total)}, toplam ${fmtInt(data.length)}.` : `${fmtInt(data.total)} kayıt burada; toplam ${fmtInt(data.length)}.`}
            </p>
            {more ? (
              <Button variant="secondary" pending={growing} onClick={() => setLimit((n) => Math.min(MAX, n + PAGE * 2))}>
                Daha eskisini göster
              </Button>
            ) : null}
          </div>
        </>
      ) : !list.error ? (
        <ScreenState kind="loading" title="Sayfaları çeviriyorum…">
          Birazdan bugün neler olduğunu okuyacaksın.
        </ScreenState>
      ) : null}
    </div>
  );
}
