"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AuditEntry } from "@/lib/domain";
import { useApi, useApiQuery } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { DEMO_MODE } from "@/lib/api/config";
import { can, deniedHint } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/session-context";
import { fmtInt } from "@/lib/format";
import { AUDIT_TAMPER_POS } from "@/mocks/ids";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { ErrorState, PageHeader, SkeletonLines } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/overlay";
import { AuditEntryDrawer } from "./audit-entry-drawer";
import { AuditFiltersBar, AuditLedger, Pager } from "./audit-table";
import { ChainStatusCard, ChainVerifyPanel } from "./chain-verify";
import { AUDIT_PAGE_SIZE, filtersFromParams, filtersToSearch, hasFilters, pageCount, pageForPos, targetPos, toAuditQuery, type AuditFilters } from "./audit-logic";
import { useChainWalk } from "./use-chain-walk";

/**
 * /audit — the SPK auditor's view (FRONTEND-SPEC §2.7, US-36, FR-30). Everyone reads;
 * R D U may verify (side-effect free) and export; nobody edits. Deep links:
 * `?run=<run_id>` (entries of a run), `?pos=<chain_pos>` (open one entry), `?dogrula=1`.
 */
export function AuditScreen() {
  const api = useApi();
  const user = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const target = targetPos(params, hash);
  const verifyKey = params.get("dogrula");

  const canVerify = can(user.role, "audit_export");
  const canTamper = can(user.role, "demo_inject") && DEMO_MODE;

  const status = useApiQuery((a) => a.auditStatus(), []);
  const total = status.data?.length ?? 0;

  // In deep-link mode the page is derived from the chain length; filters do not apply.
  const deepPage = target && total ? pageForPos(total, target) : null;
  const query = target ? (deepPage ? toAuditQuery({ ...filters, actor: "", action: "", entity: "", from: "", run_id: "", page: deepPage }) : null) : toAuditQuery(filters);
  const queryKey = JSON.stringify(query);
  const page = useApiQuery((a) => (query ? a.audit(query) : Promise.resolve(null)), [queryKey]);

  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const openedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!target || !page.data || openedFor.current === target) return;
    const hit = page.data.items.find((e) => e.chain_pos === target);
    if (hit) {
      openedFor.current = target;
      const id = setTimeout(() => setSelected(hit), 0);
      return () => clearTimeout(id);
    }
  }, [target, page.data]);

  const nav = useCallback(
    (search: string) => router.replace(`${pathname}${search}`, { scroll: false }),
    [router, pathname],
  );
  const setFilters = (f: AuditFilters) => nav(filtersToSearch(f));
  const goTo = (pos: number) => {
    openedFor.current = null;
    nav(`?pos=${pos}`);
  };

  const walk = useChainWalk(total || 4_812, () => void status.refetch());
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!verifyKey || !canVerify || !total || startedFor.current === verifyKey) return;
    startedFor.current = verifyKey;
    void walk.start();
  }, [verifyKey, canVerify, total, walk]);

  const [tamperPending, setTamperPending] = useState(false);
  const toggleTamper = async () => {
    const on = !status.data?.tamper_on;
    setTamperPending(true);
    try {
      await api.setTamper(on);
      walk.reset();
      await Promise.all([status.refetch(), page.refetch()]);
      if (on) notify.info("Kurcalama testi açık", `Demo veritabanında kayıt #${fmtInt(AUDIT_TAMPER_POS)} değiştirildi; hash yeniden hesaplanmadı.`);
      else notify.info("Kurcalama geri alındı", "Demo veritabanı özgün haline döndü.");
    } catch (e) {
      notify.error("Kurcalama testi yapılamadı", errorMessage(e));
    } finally {
      setTamperPending(false);
    }
  };

  const exportPage = () => {
    const items = page.data?.items ?? [];
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), filters: query, items }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kaptan-audit-${items[0]?.chain_pos ?? 0}-${items[items.length - 1]?.chain_pos ?? 0}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const items = page.data?.items ?? [];
  const pages = page.data ? pageCount(page.data.total, AUDIT_PAGE_SIZE) : 1;
  const currentPage = page.data?.page ?? filters.page;
  const indexOfSelected = selected ? items.findIndex((e) => e.chain_pos === selected.chain_pos) : -1;

  const tamperOn = status.data?.tamper_on ?? false;
  const tamperControl = canTamper ? (
    <div className="flex items-center gap-2">
      {tamperOn ? <Badge tone="north">Kurcalama açık · #{fmtInt(AUDIT_TAMPER_POS)}</Badge> : null}
      <Button size="sm" variant={tamperOn ? "outline" : "danger-outline"} onClick={() => void toggleTamper()} disabled={tamperPending}>
        {tamperOn ? "Kurcalamayı geri al" : "Kurcalama testi"}
      </Button>
    </div>
  ) : (
    <Tooltip content={DEMO_MODE ? deniedHint("demo_inject") : "Yalnızca demo veritabanında."}>
      <span tabIndex={0} className="hidden text-meta text-muted sm:inline">
        Kurcalama testi: Admin · demo
      </span>
    </Tooltip>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Denetim · SPK denetçisi görünümü"
        title="Denetim kaydı"
        meta="Yalnızca eklemeye açık, hash zincirli kayıt. Herkes okur; Risk Officer, Admin ve Auditor doğrular; hiç kimse düzenleyemez."
        actions={
          canVerify ? (
            <Button variant="outline" onClick={exportPage} disabled={!items.length}>
              Görünümü dışa aktar (JSON)
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(300px,1fr)]">
        <ChainVerifyPanel
          status={status.data}
          walk={walk.state}
          onVerify={() => void walk.start()}
          canVerify={canVerify}
          deniedReason={deniedHint("audit_export")}
          onGoTo={goTo}
          tamperControl={tamperControl}
        />
        {status.error ? (
          <Panel className="p-4">
            <ErrorState message={status.error} onRetry={() => void status.refetch()} />
          </Panel>
        ) : (
          <ChainStatusCard status={status.data} loading={status.loading} />
        )}
      </div>

      <Panel aria-labelledby="ledger-title">
        <header className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3">
          <h2 id="ledger-title" className="text-[15px] font-medium text-ink">
            Kayıtlar
          </h2>
          {target ? (
            <span className="flex flex-wrap items-center gap-2 text-dense text-ink-soft">
              <Badge tone="wash">Konum #{fmtInt(target)}</Badge>
              <span>ve çevresi</span>
              <button type="button" onClick={() => nav("")} className="text-dense font-medium text-ink underline underline-offset-4">
                Tüm kayıtlara dön
              </button>
            </span>
          ) : filters.run_id ? (
            <span className="flex flex-wrap items-center gap-2 text-dense text-ink-soft">
              <Badge tone="wash">
                Run <span className="code">{filters.run_id}</span>
              </Badge>
              <button type="button" onClick={() => setFilters({ ...filters, run_id: "", page: 1 })} className="text-dense font-medium text-ink underline underline-offset-4">
                Run filtresini kaldır
              </button>
            </span>
          ) : (
            <span className="text-meta text-muted">En yeni üstte · satır ayrıntıyı açar</span>
          )}
          {page.refreshing && !page.loading ? <span className="ml-auto text-meta text-muted">güncelleniyor…</span> : null}
        </header>
        {!target ? (
          <div className="border-b border-hairline bg-paper px-4 py-3">
            <AuditFiltersBar filters={filters} onChange={setFilters} />
          </div>
        ) : null}
        {page.error ? (
          <div className="p-4">
            <ErrorState message={page.error} onRetry={() => void page.refetch()} />
          </div>
        ) : page.loading || !page.data ? (
          <div className="p-4">
            <SkeletonLines lines={8} />
          </div>
        ) : (
          <>
            <AuditLedger items={items} highlightPos={target} onOpen={setSelected} filtered={hasFilters(filters)} />
            <Pager page={currentPage} pages={pages} total={page.data.total} onPage={(p) => (target ? nav(`?sayfa=${p}`) : setFilters({ ...filters, page: p }))} />
          </>
        )}
      </Panel>

      <AuditEntryDrawer
        entry={selected}
        onOpenChange={(o) => !o && setSelected(null)}
        canStep={{ prev: Boolean(selected && selected.chain_pos < total), next: Boolean(selected && selected.chain_pos > 1) }}
        onStep={(dir) => {
          if (!selected) return;
          const next = items[indexOfSelected + dir];
          if (next && indexOfSelected >= 0) setSelected(next);
          else goTo(selected.chain_pos - dir);
        }}
      />
    </div>
  );
}
