"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import type { DisclosureDetail, Explain } from "@/lib/domain";
import { useApiMutation, useApiQuery } from "@/lib/api/react";
import { IS_MOCK } from "@/lib/api/config";
import { useSession } from "@/lib/auth/session-context";
import { can, deniedHint } from "@/lib/auth/permissions";
import { fmtDateTime, fmtDec, fmtInt, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, EventBadge, FixtureBadge, TemsiliBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { DrawerContent, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from "@/components/ui/overlay";
import { ErrorState, Kbd, LlmNote, SkeletonLines } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import { preScreenOf } from "./inbox-logic";
import { REASON_LABEL } from "./feed-table";

/**
 * Disclosure detail drawer (FRONTEND-SPEC §2.2): TR/EN text, the pre-screen result and its
 * reason code, the classification, the linked run (→ /runs/[id]) and notes. j/k keep
 * working while it is open so an analyst can triage the whole day without the mouse.
 */
export function DisclosureDrawer({
  index,
  open,
  onOpenChange,
  onNoteAdded,
}: {
  index: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNoteAdded: () => void;
}) {
  return (
    <Dialog.Root open={open && index !== null} onOpenChange={onOpenChange}>
      {index !== null ? <DrawerBody index={index} onNoteAdded={onNoteAdded} /> : null}
    </Dialog.Root>
  );
}

function DrawerBody({ index, onNoteAdded }: { index: number; onNoteAdded: () => void }) {
  const q = useApiQuery((api) => api.getDisclosure(index), [index]);
  const d = q.data?.disclosure_index === index ? q.data : undefined;
  const runId = d?.run_id ?? null;
  const ex = useApiQuery((api) => (runId ? api.explain(runId) : Promise.resolve(null)), [runId]);
  const explain = ex.data && ex.data.run.run_id === runId ? ex.data : null;

  const title = d ? (
    <span className="flex flex-wrap items-baseline gap-x-3">
      <span className="code text-[22px] font-medium">{d.primary_ticker ?? "—"}</span>
      <span>{d.company_name}</span>
    </span>
  ) : (
    "Bildirim"
  );
  return (
    <DrawerContent
      title={title}
      description={d ? `${d.subject} · ${fmtDateTime(d.published_at)} · KAP #${d.disclosure_index}` : "Yükleniyor"}
      width="lg"
      onOpenAutoFocus={(e) => e.preventDefault()}
    >
      {q.error && !d ? <ErrorState message={q.error} onRetry={q.refetch} /> : null}
      {!d && !q.error ? <SkeletonLines lines={6} /> : null}
      {d ? (
        <div className="space-y-6 pb-4">
          <Stamps d={d} />
          <PreScreenSection d={d} explain={explain} loading={Boolean(runId) && ex.loading} />
          <ClassificationSection d={d} explain={explain} />
          <TextSection d={d} quarantined={explain?.guard?.quarantined ?? false} />
          <NotesSection d={d} onAdded={() => { void q.refetch(); onNoteAdded(); }} />
          <p className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3 text-meta text-muted">
            <Kbd>j</Kbd>
            <Kbd>k</Kbd> sonraki / önceki bildirim · <Kbd>Esc</Kbd> kapat
          </p>
        </div>
      ) : null}
    </DrawerContent>
  );
}

function Section({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-2 flex items-baseline gap-3 border-b border-ink pb-1.5">
        <h3 id={id} className="text-ui font-medium text-ink">
          {title}
        </h3>
        {aside ? <div className="ml-auto text-meta text-muted">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Stamps({ d }: { d: DisclosureDetail }) {
  const fixture = d.ingest_source === "demo";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="outline" title="Bildirim sınıfı">
        <span className="code">{d.disclosure_class}</span> {d.disclosure_type}
      </Badge>
      <Badge tone={d.reason === "NEW" ? "muted" : "outline"} title={d.related_index ? `İlgili bildirim #${d.related_index}` : undefined}>
        {REASON_LABEL[d.reason]}
        {d.related_index ? <span className="code">#{d.related_index}</span> : null}
      </Badge>
      <Badge tone="muted">{d.has_multilang ? "TR · EN" : "Yalnızca TR"}</Badge>
      {d.attachment_count > 0 ? <Badge tone="muted">{fmtInt(d.attachment_count)} ek</Badge> : null}
      {d.is_late ? <Badge tone="outline">Geç yayımlandı</Badge> : null}
      {fixture ? <FixtureBadge /> : null}
      <TemsiliBadge />
      <span className="ml-auto text-meta text-muted">
        {IS_MOCK || fixture ? (
          <span title="Fikstür: KAP bağlantısı tıklanabilir değildir">KAP #{d.disclosure_index} · Temsili</span>
        ) : (
          <a className="underline underline-offset-4 hover:text-ink" href={`https://www.kap.org.tr/tr/Bildirim/${d.disclosure_index}`} target="_blank" rel="noreferrer noopener">
            KAP #{d.disclosure_index}
          </a>
        )}
      </span>
    </div>
  );
}

function PreScreenSection({ d, explain, loading }: { d: DisclosureDetail; explain: Explain | null; loading: boolean }) {
  const p = preScreenOf(d);
  const veto = explain?.pre_gate && !explain.pre_gate.passed;
  const guard = explain?.guard ?? null;
  return (
    <Section id="ds-pre" title="Ön eleme" aside={<>LLM çağrısı <b className="font-medium text-ink">{explain ? fmtInt(explain.run.llm_calls) : p.llmCalls}</b></>}>
      <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2 text-dense">
        <dt className="text-muted">Rota</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{p.label}</span>
          <span className="code border border-rule-soft bg-sunk px-1 text-ink-soft">{p.code}</span>
        </dd>
        <dt className="text-muted">Gerekçe</dt>
        <dd className="text-ink-soft">{p.detail}</dd>
        {explain?.pre_gate ? (
          <>
            <dt className="text-muted">Ön kapı</dt>
            <dd>
              <span className={cn("font-medium", veto ? "text-north" : "text-ink")}>{veto ? "Sert veto — kural motoruna ulaşmadı" : "Geçti"}</span>
              {explain.pre_gate.reasons.length ? (
                <ul className="mt-1 space-y-0.5">
                  {explain.pre_gate.reasons.map((r) => (
                    <li key={r} className="text-ink-soft">
                      <ReasonLine text={r} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </dd>
          </>
        ) : null}
        {guard ? (
          <>
            <dt className="text-muted">Prompt Guard</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums">{fmtDec(guard.injection_score)}</span>
              {guard.quarantined ? <Badge tone="north-solid">Karantina</Badge> : <span className="text-muted">eşik 0,90 · temiz</span>}
              {guard.regex_hits.length ? <span className="text-ink-soft">{guard.regex_hits.length} TR regex eşleşmesi</span> : null}
            </dd>
          </>
        ) : null}
        {loading ? (
          <>
            <dt className="text-muted">Çalıştırma</dt>
            <dd>
              <SkeletonLines lines={1} />
            </dd>
          </>
        ) : null}
      </dl>
    </Section>
  );
}

/** "R04_RESTRICTED: VBTS brüt takas…" → code in mono, the rest as prose. */
function ReasonLine({ text }: { text: string }) {
  const m = /^([A-Z0-9_]{3,}):\s*(.*)$/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      <span className="code text-ink">{m[1]}</span> {m[2]}
    </>
  );
}

function ClassificationSection({ d, explain }: { d: DisclosureDetail; explain: Explain | null }) {
  const c = d.classification;
  const run = explain?.run ?? null;
  const approval = explain?.approval ?? null;
  return (
    <Section id="ds-class" title="Sınıflandırma ve çalıştırma">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-dense">
        {c ? (
          <>
            <EventBadge type={c.event_type} />
            <span className="text-ink-soft">
              güven <b className="font-medium text-ink tabular-nums">{fmtDec(c.confidence)}</b> · {c.method === "llm" ? "LLM sınıflandırıcı" : "konu haritası (LLM'siz)"}
            </span>
          </>
        ) : d.run_id ? (
          <span className="inline-flex items-center gap-1.5 text-wash">
            <span aria-hidden className="size-1.5 animate-pulse-dot bg-wash" /> Sınıflandırılıyor…
          </span>
        ) : (
          <span className="text-muted">Sınıflandırılmadı — {d.is_noise ? "devre kesici gürültüsü" : "ön elemede ayrıldı"}.</span>
        )}
      </div>
      {explain?.classifier?.rationale_tr ? (
        <blockquote className="mt-2 border-l-[3px] border-ink-soft bg-sunk px-3 py-2 text-dense text-ink-soft">
          {explain.classifier.rationale_tr}
          <div className="mt-1">
            <LlmNote />
          </div>
        </blockquote>
      ) : null}
      {d.run_id ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button asChild variant="primary" size="sm">
            <Link href={`/runs/${d.run_id}`}>Neden bu işlem? · çalıştırmayı aç</Link>
          </Button>
          {approval && approval.status === "pending" ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/approvals?oneri=${encodeURIComponent(approval.proposal_id)}`}>Onay kuyruğunda aç</Link>
            </Button>
          ) : null}
          {run ? (
            <span className="text-meta text-muted">
              <span className="code">{run.run_id}</span> · {run.outcome ?? run.status}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-meta text-muted">Bu bildirim için graf çalıştırılmadı (LLM çağrısı 0).</p>
      )}
    </Section>
  );
}

function TextSection({ d, quarantined }: { d: DisclosureDetail; quarantined: boolean }) {
  const tr = d.texts.find((t) => t.lang === "tr");
  const en = d.texts.find((t) => t.lang === "en");
  const body = (text: string) => (
    <div className="max-h-[42vh] overflow-y-auto border-[1.5px] border-ink bg-paper px-4 py-3">
      <p className="text-ui leading-6 whitespace-pre-wrap text-ink">{text}</p>
    </div>
  );
  return (
    <Section id="ds-text" title="Bildirim metni" aside="Temsili fikstür metni">
      {quarantined ? (
        <p role="note" className="mb-2 border-l-[3px] border-north bg-north-tint px-3 py-2 text-dense text-north">
          Bu metin karantinada: içindeki talimat benzeri ifadeler veri olarak gösterilir, asla uygulanmaz.
        </p>
      ) : null}
      {en ? (
        <Tabs defaultValue="tr">
          <TabsList aria-label="Metin dili">
            <TabsTrigger value="tr">Türkçe</TabsTrigger>
            <TabsTrigger value="en">English</TabsTrigger>
          </TabsList>
          <TabsContent value="tr" className="pt-3">
            {body(tr?.body ?? "")}
          </TabsContent>
          <TabsContent value="en" className="pt-3" lang="en">
            {body(en.body)}
          </TabsContent>
        </Tabs>
      ) : (
        body(tr?.body ?? d.summary)
      )}
    </Section>
  );
}

function NotesSection({ d, onAdded }: { d: DisclosureDetail; onAdded: () => void }) {
  const user = useSession();
  const allowed = can(user.role, "note");
  const [body, setBody] = useState("");
  const add = useApiMutation((api, text: string) => api.addNote(d.disclosure_index, text));
  const len = body.trim().length;
  const submit = async () => {
    if (!allowed || len === 0 || len > 1000) return;
    const note = await add.run(body);
    if (note) {
      setBody("");
      notify.success("Not eklendi", "Audit kaydına yazıldı.");
      onAdded();
    }
  };
  const button = (
    <Button type="submit" size="sm" variant="secondary" disabled={!allowed || len === 0 || len > 1000 || add.pending} aria-disabled={!allowed}>
      {add.pending ? "Ekleniyor…" : "Not ekle"}
    </Button>
  );
  return (
    <Section id="ds-notes" title="Notlar" aside={`${fmtInt(d.notes.length)} not`}>
      {d.notes.length ? (
        <ol className="mb-3 space-y-2">
          {d.notes.map((n) => (
            <li key={n.id} className="border-l-[3px] border-wash bg-wash-tint px-3 py-2">
              <p className="text-dense whitespace-pre-wrap text-ink">{n.body}</p>
              <p className="mt-1 text-meta text-muted">
                {n.author} · {fmtTime(n.created_at)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mb-3 text-dense text-muted">Henüz not yok.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-2"
      >
        <Field label="Yeni not" hint={allowed ? "Ctrl+Enter ile ekleyin · audit kaydına yazılır · kişisel veri yazmayın" : deniedHint("note")} error={add.error}>
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              value={body}
              disabled={!allowed}
              maxLength={1000}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
              className="min-h-[72px]"
            />
          )}
        </Field>
        <div className="flex items-center gap-3">
          {allowed ? button : <Tooltip content={deniedHint("note")}><span tabIndex={0}>{button}</span></Tooltip>}
          <span className={cn("text-meta tabular-nums", len > 1000 ? "text-north" : "text-muted")}>{len}/1000</span>
        </div>
      </form>
    </Section>
  );
}

