"use client";

import { useState } from "react";
import Link from "next/link";
import type { RestrictedKind, RestrictedSecurity } from "@/lib/domain";
import { useApiQuery } from "@/lib/api/react";
import { can, deniedHint } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/session-context";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { EmptyState, ErrorState, SkeletonLines } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import { addedByLabel, KIND_LABEL, MANUAL_KINDS, normalizeTicker, tickerError } from "./admin-logic";
import { useAction } from "./use-action";

const selectCls =
  "h-10 w-full border-[1.5px] border-ink bg-panel px-2 text-ui text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

/**
 * Team block list (`restricted_securities`, 06 R13, US-57): adding is immediate (D);
 * removing is a request (D, 1/2) that a Risk Officer confirms on /limits (2/2).
 */
export function RestrictedPanel() {
  const user = useSession();
  const q = useApiQuery((a) => a.restricted(), []);
  const add = useAction();
  const removal = useAction();
  const [ticker, setTicker] = useState("");
  const [kind, setKind] = useState<RestrictedKind>("team_insider");
  const [source, setSource] = useState("");
  const [touched, setTouched] = useState(false);
  const canAdd = can(user.role, "blocklist_add");
  const err = touched ? tickerError(ticker) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (tickerError(ticker)) return;
    const t = normalizeTicker(ticker);
    const r = await add.run((api) => api.addRestricted({ ticker: t, kind, source_ref: source.trim() || null }));
    if (!r.ok) return;
    notify.success(`${t} engel listesinde`, "Hemen etkili: ön eleme, risk kapısı (R13) ve gönderim anı kontrolü.");
    setTicker("");
    setSource("");
    setTouched(false);
    await q.refetch();
  };

  const requestRemoval = async (entry: RestrictedSecurity) => {
    const r = await removal.run((api) => api.requestRestrictedRemoval(entry.id));
    if (!r.ok) {
      notify.error("Talep açılamadı", r.error);
      return;
    }
    notify.info(`${entry.ticker} için çıkarma talebi (1/2)`, "Risk Officer, Limitler ekranında onaylar.");
    await q.refetch();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
      <Panel aria-labelledby="restricted-title">
        <PanelHeader
          id="restricted-title"
          code="R13"
          title="Engel listesi"
          meta="Tedbir kayıtları 30 dakikada bir senkronlanır; ekip içeriden-öğrenen kayıtlarını Admin girer."
        />
        {q.error ? (
          <div className="p-4">
            <ErrorState message={q.error} onRetry={() => void q.refetch()} />
          </div>
        ) : q.loading ? (
          <div className="p-4">
            <SkeletonLines lines={4} />
          </div>
        ) : (q.data ?? []).length === 0 ? (
          <EmptyState title="Engel listesi boş." body="Ekip beyanları alındığında buraya eklenir (09 §10)." />
        ) : (
          <ul className="divide-y divide-hairline">
            {(q.data ?? []).map((e) => {
              const requested = Boolean(e.removal_requested_by);
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <span className="code w-16 text-[15px] font-medium text-ink">{e.ticker}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-dense text-ink">{KIND_LABEL[e.kind]}</span>
                    <span className="block text-meta text-muted">
                      {e.source_ref ?? "Kaynak yok"} · {fmtDate(e.added_at)} · {addedByLabel(e.added_by)}
                    </span>
                  </span>
                  {requested ? (
                    <Badge tone="wash">Çıkarma talebi 1/2 · Risk Officer onayı bekliyor</Badge>
                  ) : (
                    <Button size="sm" variant="outline" disabled={!canAdd || removal.pending} onClick={() => void requestRemoval(e)}>
                      Çıkarma talebi aç
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t border-hairline px-4 py-3 text-meta text-muted">
          Çıkarma iki kişi ister: talep (Admin) → onay (Risk Officer,{" "}
          <Link href="/limits" className="underline underline-offset-4 hover:text-ink">
            Limitler
          </Link>
          ). Ekleme tek kişiyle hemen etkilidir; sistem güvenli yöne hata yapar.
        </p>
      </Panel>

      <Panel aria-labelledby="add-title" className="self-start">
        <PanelHeader id="add-title" title="Listeye ekle" meta="Hemen etkili · audit'e yazılır" />
        <form onSubmit={submit} noValidate className="space-y-4 p-4">
          <Field label="Sembol" required error={err}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="ör. KRGMD"
                className="code uppercase"
                maxLength={6}
                autoComplete="off"
                disabled={!canAdd}
              />
            )}
          </Field>
          <Field label="Tür">
            {({ id }) => (
              <select id={id} className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as RestrictedKind)} disabled={!canAdd}>
                {MANUAL_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Kaynak" hint="Ör. “Ekip beyanı W1”. Kişi adı yazmayın (KVKK).">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={source} onChange={(e) => setSource(e.target.value)} maxLength={120} disabled={!canAdd} />}
          </Field>
          {add.error ? (
            <p role="alert" className="border-l-[3px] border-north bg-north-tint px-3 py-2 text-dense text-north">
              {add.error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" className="w-full" disabled={!canAdd || add.pending}>
            {add.pending ? "Ekleniyor…" : "Engel listesine ekle"}
          </Button>
          {!canAdd ? <p className="text-meta text-muted">{deniedHint("blocklist_add")}</p> : null}
        </form>
      </Panel>
    </div>
  );
}
