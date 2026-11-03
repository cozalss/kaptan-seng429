"use client";

import { memo, useMemo } from "react";
import type { AuditEntry } from "@/lib/domain";
import { actorParts } from "@/lib/actors";
import { auditCompany, auditSentence } from "@/lib/audit-words";
import { fmtDateTime, fmtInt, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dayGroups, dayHeading, inVoice, voiceOf } from "./diary-words";
import { groupRuns, runMeta, runSentence, type LedgerRow } from "./ledger-runs";

/** The id a record's row carries, so "Kaydı göster" can scroll to it. */
export const rowId = (pos: number) => `kayit-${pos}`;

const VOICE_NAME = { sen: "Sen", kaptan: "KAPtan" } as const;

/**
 * The diary. Each day opens with its name in large type; under it the two voices sit either side
 * of the same line, KAPtan on the left and you on the right, so your own acts stand out at a
 * glance. On a phone they share one column and the voice names itself. Routine machine work folds
 * into one line that opens to the originals.
 */
export const Diary = memo(function Diary({ items, broken, today }: { items: readonly AuditEntry[]; broken: number | null; today: string | null }) {
  const days = useMemo(() => dayGroups(items), [items]);
  return (
    <ol aria-label="Geçmiş kayıtları" className="gc-diary">
      {days.map((d) => (
        <li key={d.day} className="gc-day">
          <h2 className="u-chapter gc-day-name">{dayHeading(d.day, today)}</h2>
          <div aria-hidden className="gc-voices">
            <span>KAPtan</span>
            <span>Sen</span>
          </div>
          <ol className="gc-entries">
            {groupRuns(d.rows).map((r) => (
              <Entry key={keyOf(r)} row={r} broken={broken} />
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
});

const keyOf = (r: LedgerRow) => (r.kind === "one" ? `r${r.entry.chain_pos}` : `run${r.entries[0]?.chain_pos}`);

function Entry({ row, broken }: { row: LedgerRow; broken: number | null }) {
  return row.kind === "one" ? <One entry={row.entry} broken={broken} /> : <Run entries={row.entries} actor={row.actor} action={row.action} broken={broken} />;
}

/** The sentence; a ticker nobody could name stays a code. */
function Sentence({ entry }: { entry: AuditEntry }) {
  const text = inVoice(auditSentence(entry));
  const company = auditCompany(entry);
  const at = company.code ? text.indexOf(company.text) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <code className="code">{company.text}</code>
      {text.slice(at + company.text.length)}
    </>
  );
}

function One({ entry, broken }: { entry: AuditEntry; broken: number | null }) {
  const voice = voiceOf(entry.actor);
  const bad = broken !== null && entry.chain_pos === broken;
  return (
    <li id={rowId(entry.chain_pos)} data-voice={voice} data-bad={bad || undefined} className="gc-entry">
      <div className="gc-say">
        <p className="gc-who">
          <span className="gc-who-name">{VOICE_NAME[voice]}</span>
          <time dateTime={entry.occurred_at} className="gc-time">
            {fmtTime(entry.occurred_at)}
          </time>
        </p>
        <p className="gc-sentence">
          <Sentence entry={entry} />
        </p>
        {bad ? <p className="gc-broken-note">Zincir burada kopuyor: bu kayıt yazıldıktan sonra değiştirilmiş.</p> : null}
        <Details entry={entry} open={bad} />
      </div>
      <span aria-hidden className="gc-node" />
    </li>
  );
}

/** The record's small print: only here do its number and fingerprints appear. */
function Details({ entry, open }: { entry: AuditEntry; open: boolean }) {
  const who = actorParts(entry.actor);
  return (
    <details className="gc-details" open={open || undefined}>
      <summary className="gc-details-sum">Ayrıntılar</summary>
      <p className="gc-details-why">Parmak izi, kaydın içeriğinden hesaplanan bir koddur. Tek harf değişse kod da değişir; her kayıt bir öncekinin izini taşır.</p>
      <dl className="gc-details-list">
        <div>
          <dt>Kayıt</dt>
          <dd className="tabular-nums">#{fmtInt(entry.chain_pos)}</dd>
        </div>
        <div>
          <dt>Zaman</dt>
          <dd className="tabular-nums">{fmtDateTime(entry.occurred_at)}</dd>
        </div>
        {who.kind ? (
          <div>
            <dt>Yapan</dt>
            <dd>
              {who.name}, {who.kind}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Parmak izi</dt>
          <dd className="gc-hash code">{entry.hash}</dd>
        </div>
        <div>
          <dt>Bir önceki</dt>
          <dd className="gc-hash code">{entry.prev_hash}</dd>
        </div>
      </dl>
    </details>
  );
}

/** A folded run of one machine's repeated act; opening it shows the original rows. */
function Run({ entries, actor, action, broken }: { entries: readonly AuditEntry[]; actor: string; action: string; broken: number | null }) {
  const newest = entries[0] as AuditEntry;
  const hasBroken = broken !== null && entries.some((e) => e.chain_pos === broken);
  return (
    <li data-voice="kaptan" className={cn("gc-entry gc-run")}>
      <div className="gc-say">
        <details className="group" open={hasBroken || undefined}>
          <summary className="gc-run-sum">
            <span className="gc-who">
              <span className="gc-who-name">KAPtan</span>
              <time dateTime={newest.occurred_at} className="gc-time">
                {runMeta(entries)}
              </time>
            </span>
            <span className="gc-sentence block">{inVoice(runSentence(actorParts(actor).name, action, entries.length))}</span>
            <span className="gc-run-open">
              <span className="group-open:hidden">Tek tek göster</span>
              <span className="hidden group-open:inline">Topla</span>
            </span>
          </summary>
          <ol className="gc-run-list">
            {entries.map((e) => (
              <li key={e.chain_pos} id={rowId(e.chain_pos)} data-bad={broken === e.chain_pos || undefined} className="gc-run-row">
                <time dateTime={e.occurred_at} className="gc-time">
                  {fmtTime(e.occurred_at)}
                </time>
                <div className="min-w-0">
                  <p className="gc-sentence">
                    <Sentence entry={e} />
                  </p>
                  {broken === e.chain_pos ? <p className="gc-broken-note">Zincir burada kopuyor: bu kayıt yazıldıktan sonra değiştirilmiş.</p> : null}
                  <Details entry={e} open={broken === e.chain_pos} />
                </div>
              </li>
            ))}
          </ol>
        </details>
      </div>
      <span aria-hidden className="gc-node" />
    </li>
  );
}
