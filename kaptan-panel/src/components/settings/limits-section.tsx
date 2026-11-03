"use client";

import { useState } from "react";
import type { LimitKey, LimitsView, LimitVersion } from "@/lib/domain";
import { useApiMutation } from "@/lib/api/react";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDesk } from "@/components/shell/desk-state";
import { ScreenState } from "@/components/shell/page-frame";
import { Button } from "@/components/ui/button";
import { ChangeLimit } from "./limits-change";
import { changedKey, FIRST_LIMITS, historyLine, limitForYou, limitSentence, limitTitle, limitValueText, PLAIN_LIMITS, valueOf } from "./limits-logic";

/** Sınırlar: each limit as a big value, its meaning and what it means for you today; one action to change it. */
export function LimitsSection({ view, error, onRetry, onChanged }: { view: LimitsView | null; error: string | null; onRetry: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState<LimitKey | null>(null);
  if (error && !view) {
    return (
      <ScreenState kind="error" title="Sınırlarını getiremedim." onRetry={onRetry}>
        {error} Sınırlar yerinde ve geçerli; yalnızca şu an gösteremiyorum.
      </ScreenState>
    );
  }
  if (!view) {
    return (
      <ScreenState kind="loading" title="Sınırlarına bakıyorum…">
        Birazdan her birinin senin için ne demek olduğunu göreceksin.
      </ScreenState>
    );
  }
  const others = PLAIN_LIMITS.filter((k) => !FIRST_LIMITS.includes(k));
  const row = (k: LimitKey) => <LimitRow key={k} k={k} view={view} editing={editing === k} onEdit={() => setEditing(editing === k ? null : k)} onDone={onChanged} />;
  return (
    <section aria-labelledby="sinirlar-baslik" id="sinirlar" className="ay-limits">
      <h2 id="sinirlar-baslik" className="sr-only">
        Sınırlar
      </h2>
      {view.pending ? <Unfinished view={view} onDone={onChanged} /> : null}
      <ul aria-label="Geçerli sınırlar" className="ay-rows">
        {FIRST_LIMITS.map(row)}
        <li>
          <details className="ay-more group" open={editing !== null && others.includes(editing) ? true : undefined}>
            <summary className="ay-more-sum">
              <span className="group-open:hidden">{others.length} teknik sınır daha</span>
              <span className="hidden group-open:inline">Teknik sınırları gizle</span>
            </summary>
            <ul className="ay-rows">{others.map(row)}</ul>
          </details>
        </li>
      </ul>
      <History versions={view.history} />
    </section>
  );
}

function LimitRow({ k, view, editing, onEdit, onDone }: { k: LimitKey; view: LimitsView; editing: boolean; onEdit: () => void; onDone: () => void }) {
  const { risk } = useDesk();
  const v = valueOf(view.active.values, k);
  if (v === null) return null;
  const forYou = limitForYou(k, v, risk);
  return (
    <li data-limit={k} className={cn("ay-row", editing && "ay-row-open")}>
      <p aria-hidden className="ay-value">
        {limitValueText(k, v)}
      </p>
      <div className="min-w-0">
        <h3 className="ay-title">{limitTitle(k)}</h3>
        <p className="ay-sentence">{limitSentence(k, v)}</p>
        {forYou ? <p className="ay-you">{forYou}</p> : null}
      </div>
      {view.pending ? null : (
        <Button variant="secondary" aria-expanded={editing} aria-label={`${editing ? "Vazgeç" : "Değiştir"}: ${limitTitle(k)}`} className="ay-edit" onClick={onEdit}>
          {editing ? "Vazgeç" : "Değiştir"}
        </Button>
      )}
      {editing ? (
        <ChangeLimit
          limit={k}
          view={view}
          onDone={() => {
            onEdit();
            onDone();
          }}
        />
      ) : null}
    </li>
  );
}

/** A change that was recorded but not applied (its second step failed): finish it or drop it. */
function Unfinished({ view, onDone }: { view: LimitsView; onDone: () => void }) {
  const pending = view.pending as LimitVersion;
  const key = changedKey(pending, view.active);
  const decide = useApiMutation((api, decision: "approve" | "reject") => api.decideLimit(pending.version, { decision, comment: "" }));
  const run = async (d: "approve" | "reject") => {
    const r = await decide.run(d);
    if (r) onDone();
  };
  const before = key ? valueOf(view.active.values, key) : null;
  const after = key ? valueOf(pending.values, key) : null;

  return (
    <div className="ay-pending" data-testid="limit-pending">
      <h3 className="text-[20px] leading-7 font-semibold text-ink">Yarım kalan değişiklik</h3>
      {key && before !== null && after !== null ? (
        <div className="mt-1 space-y-1 text-body">
          <p className="text-muted line-through decoration-rule-soft">{limitSentence(key, before)}</p>
          <p className="font-medium text-ink">{limitSentence(key, after)}</p>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" pending={decide.pending} disabled={decide.pending} onClick={() => void run("approve")}>
          {decide.pending ? "Kaydediliyor…" : "Uygula"}
        </Button>
        <Button variant="ghost" disabled={decide.pending} onClick={() => void run("reject")}>
          Vazgeç
        </Button>
      </div>
      {decide.error ? (
        <p role="alert" className="mt-2 text-dense text-north">
          {decide.error}
        </p>
      ) : null}
    </div>
  );
}

function History({ versions }: { versions: LimitVersion[] }) {
  const shown = versions.slice(0, 5);
  return (
    <details className="ay-history">
      <summary className="ay-more-sum">Sınırlar daha önce nasıldı?</summary>
      <ol aria-label="Sınır sürümleri" className="ay-history-list">
        {shown.map((v) => (
          <li key={v.version} className="ay-history-row">
            <span className="font-semibold text-ink tabular-nums">{fmtInt(v.version)}. hâli</span>
            <span className="tabular-nums">{historyLine(v)}</span>
            {v.status === "active" ? <span className="text-meta font-semibold text-gain">yürürlükte</span> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
