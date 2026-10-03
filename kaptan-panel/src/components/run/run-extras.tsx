"use client";

import { useEffect, useState } from "react";
import type { Explain } from "@/lib/domain";
import { useApiMutation, useApiQuery } from "@/lib/api/react";
import { can, deniedHint } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/session-context";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Dialog, DialogContent, DialogTrigger, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from "@/components/ui/overlay";
import { notify } from "@/components/ui/toast";
import { ErrorState } from "@/components/ui/primitives";
import { Section } from "./section";

/** Table of contents (right rail ≥ xl, chip strip below) with scroll-spy, JSON view, notes. */
export interface TocItem {
  id: string;
  num: string;
  label: string;
  mark?: "ok" | "veto" | "stop" | "wait" | "none";
}

const MARK_CLS: Record<NonNullable<TocItem["mark"]>, string> = {
  ok: "bg-ink",
  veto: "bg-north",
  stop: "border border-ink bg-panel",
  wait: "bg-wash",
  none: "border border-dashed border-rule-soft",
};

function useScrollSpy(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join("|");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = key.split("|").map((id) => document.getElementById(id)).filter((x): x is HTMLElement => Boolean(x));
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((en) => en.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [key]);
  return active;
}

export function Toc({ items, variant }: { items: readonly TocItem[]; variant: "rail" | "strip" }) {
  const active = useScrollSpy(items.map((i) => i.id));
  if (variant === "strip") {
    return (
      <nav aria-label="Bölümler" className="-mx-4 overflow-x-auto border-y border-hairline bg-paper px-4 py-2 sm:mx-0 sm:border-x xl:hidden">
        <ol className="flex gap-1.5">
          {items.map((it) => (
            <li key={it.id} className="shrink-0">
              <a href={`#${it.id}`} className={cn("inline-flex h-8 items-center gap-1.5 border px-2 text-dense", active === it.id ? "border-ink bg-ink text-on-dark" : "border-hairline bg-panel text-ink hover:border-ink")}>
                <span aria-hidden className={cn("inline-block size-2", MARK_CLS[it.mark ?? "none"])} />
                {it.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    );
  }
  return (
    <nav aria-label="İçindekiler" className="sticky top-[calc(var(--chrome-top)+var(--topbar-h)+16px)] hidden xl:block">
      <p className="mb-2 text-meta text-muted">İçindekiler</p>
      <ol className="border-l-[1.5px] border-ink">
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              aria-current={active === it.id ? "location" : undefined}
              className={cn("-ml-[1.5px] flex items-center gap-2 border-l-[3px] py-1.5 pr-2 pl-3 text-dense", active === it.id ? "border-ink bg-wash-tint font-medium text-ink" : "border-transparent text-ink-soft hover:text-ink")}
            >
              <span className="code w-6 text-muted">§{it.num}</span>
              <span className="flex-1">{it.label}</span>
              <span aria-hidden className={cn("inline-block size-2", MARK_CLS[it.mark ?? "none"])} />
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function JsonView({ e }: { e: Explain }) {
  const docs = [
    { key: "proposal", label: "TradeProposal", value: e.proposal },
    { key: "rule", label: "RuleDecision", value: e.rule_decision },
    { key: "merged", label: "MergedFeatures", value: e.merged },
    { key: "run", label: "RunSummary", value: e.run },
  ].filter((d) => d.value !== null);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          JSON
        </Button>
      </DialogTrigger>
      <DialogContent title="Karar kayıtları (JSON)" description="Sunucunun döndürdüğü ham kayıtlar; ekrandaki her satır bunlardan kurulur." size="lg">
        <Tabs defaultValue={docs[0]?.key}>
          <TabsList>
            {docs.map((d) => (
              <TabsTrigger key={d.key} value={d.key}>
                {d.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {docs.map((d) => (
            <TabsContent key={d.key} value={d.key}>
              <pre tabIndex={0} aria-label={`${d.label} JSON`} className="code mt-3 max-h-[55vh] overflow-auto border border-hairline bg-sunk p-3 text-[12px] leading-[18px] text-ink">
                {JSON.stringify(d.value, null, 2)}
              </pre>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export function NotesSection({ index }: { index: number }) {
  const { role } = useSession();
  const allowed = can(role, "note");
  const q = useApiQuery((api) => api.getDisclosure(index), [index]);
  const add = useApiMutation((api, body: string) => api.addNote(index, body));
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const notes = q.data?.notes ?? [];

  const submit = async () => {
    const text = body.trim();
    if (!text) return setErr("Not boş olamaz.");
    if (text.length > 1000) return setErr("En çok 1000 karakter.");
    setErr(null);
    const n = await add.run(text);
    if (n) {
      setBody("");
      notify.success("Not eklendi", "Audit zincirine yazıldı.");
      void q.refetch();
    }
  };

  return (
    <Section id="notlar" num="15" title="Notlar" meta="Bildirime bağlı ekip notları (Analist, Risk Officer, Admin yazar; Auditor salt okur)">
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          {q.error ? <ErrorState message={q.error} onRetry={() => void q.refetch()} /> : null}
          {notes.length ? (
            <ul className="divide-y divide-hairline border-y border-hairline">
              {notes.map((n) => (
                <li key={n.id} className="py-2">
                  <p className="text-meta text-muted">
                    {n.author} · {fmtDateTime(n.created_at)}
                  </p>
                  <p className="text-dense whitespace-pre-wrap text-ink">{n.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-dense text-muted">{q.loading ? "Yükleniyor…" : "Henüz not yok."}</p>
          )}
        </div>
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            void submit();
          }}
          className="space-y-2"
        >
          <Field label="Not ekle" hint="1–1000 karakter · kişisel veri yazmayın" error={err ?? add.error}>
            {({ id, describedBy, invalid }) => (
              <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} value={body} maxLength={1000} disabled={!allowed} onChange={(ev) => setBody(ev.target.value)} placeholder={allowed ? "Gözleminiz…" : deniedHint("note")} />
            )}
          </Field>
          {allowed ? (
            <Button type="submit" size="sm" variant="secondary" disabled={add.pending}>
              {add.pending ? "Ekleniyor…" : "Notu kaydet"}
            </Button>
          ) : (
            <Tooltip content={deniedHint("note")}>
              <Button size="sm" variant="secondary" aria-disabled="true" aria-description={deniedHint("note")} className="cursor-not-allowed opacity-45 shadow-none" onClick={(e) => e.preventDefault()}>
                Notu kaydet
              </Button>
            </Tooltip>
          )}
        </form>
      </div>
    </Section>
  );
}
