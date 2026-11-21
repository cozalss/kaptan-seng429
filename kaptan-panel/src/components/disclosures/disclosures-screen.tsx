"use client";

import "./disclosures.css";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { deferredCount, type ApprovalCard } from "@/lib/domain";
import { MAX_DISCLOSURES } from "@/lib/api/limits";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { fmtInt } from "@/lib/format";
import { HOME } from "@/lib/nav";
import { istanbulDay, sessionView } from "@/lib/session-day";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { nextTradingDay, prevTradingDay } from "@/lib/time";
import { PageHeader, ScreenState } from "@/components/shell/page-frame";
import { Term } from "@/components/story/term";
import { useDesk } from "@/components/shell/desk-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { fateOf, flowFromList, tickerOf } from "./disclosure-logic";
import { Funnel, type FunnelFilter } from "./funnel";
import { FilterBar } from "./filter-bar";
import { filtersToQuery, isNarrowed, parseFilters, toQuery, type Filters } from "./filters";
import { ReadingDrawer } from "./reading-drawer";
import { ReadingMarksProvider, useReadingMarks } from "@/components/reading/marks";
import { ReadingBar } from "@/components/reading/reading-bar";
import { SavedList } from "@/components/reading/saved-list";
import { DisclosureHours, Worthwhile } from "./disclosure-rows";
import { readingSentence, waitingNote, type FunnelCounts, type WaitingNote } from "./reading-words";

/** Rows at first; "tane daha göster" adds as many again. */
const PAGE = 25;

/**
 * /bildirimler ("Okunanlar"): what KAPtan read on a day and what became of it. The sentence, what a
 * bildirim is, the day's funnel (which is also the filter), what might matter to you, then
 * everything else, hour by hour.
 */
export function DisclosuresScreen() {
  return (
    <ReadingMarksProvider>
      <DisclosuresBody />
    </ReadingMarksProvider>
  );
}

function DisclosuresBody() {
  const now = useNow(60_000);
  const { counters } = useDesk();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromAddress = useMemo(() => parseFilters(params), [params]);
  // The screen answers a change at once; the address follows. An address we pushed ourselves is only an echo;
  // any other change of it (Back, a link) wins.
  const addressKey = filtersToQuery(fromAddress);
  const [local, setLocal] = useState({ seen: addressKey, now: fromAddress, pushed: [] as string[] });
  if (local.seen !== addressKey) {
    const at = local.pushed.indexOf(addressKey);
    setLocal(at >= 0 ? { ...local, seen: addressKey, pushed: local.pushed.slice(at + 1) } : { seen: addressKey, now: fromAddress, pushed: [] });
  }
  const filters = local.now;
  const setFilters = (next: Filters) => {
    const query = filtersToQuery(next);
    setLocal((l) => ({ ...l, now: next, pushed: [...l.pushed, query] }));
    router.replace(`${pathname}${query}`, { scroll: false });
  };
  const narrowed = isNarrowed(filters);
  const marks = useReadingMarks();
  const [savedView, setSavedView] = useState(false);
  const openIndex = filters.open;
  const markOpened = marks?.open;
  useEffect(() => {
    if (openIndex) void markOpened?.(openIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a newly opened duyuru counts as read
  }, [openIndex]);
  const picked = filters.day;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FunnelFilter>("all");
  const [shown, setShown] = useState(PAGE);
  const session = now === null ? null : sessionView(now, counters?.total ?? null);
  const day = picked ?? session?.shown ?? null;
  const today = now === null ? null : istanbulDay(now);

  const server = toQuery(filters);
  const serverKey = JSON.stringify(server);
  const q = useApiQuery((api) => (day ? api.disclosures({ day, limit: MAX_DISCLOSURES, ...server }) : Promise.resolve(null)), [day, serverKey]);
  // The day's exact total (the list stops at MAX_DISCLOSURES): GET /disclosures/counters?day=.
  const exact = useApiQuery((api) => (day ? api.counters(day) : Promise.resolve(null)), [day]);
  const cards = useApiQuery((api) => api.listApprovals("all"), []);
  useEventStream("feed", {
    counters: () => {
      if (day !== today) return;
      void q.refetch();
      void exact.refetch();
    },
  });
  useEventStream("desk", {
    "approval.requested": () => void cards.refetch(),
    "approval.decided": () => void cards.refetch(),
  });

  const cardOf = useMemo(() => {
    const byIndex = new Map<number, ApprovalCard>();
    for (const c of cards.data ?? []) byIndex.set(c.disclosure_index, c);
    return byIndex;
  }, [cards.data]);

  const counts = useMemo<FunnelCounts | null>(() => {
    if (!q.data) return null;
    const list = flowFromList(q.data);
    const usefulInList = q.data.filter((d) => cardOf.has(d.disclosure_index)).length;
    const e = exact.data;
    return e && !narrowed && e.total >= q.data.length
      ? { total: e.total, noise: e.noise, archived: e.archived, processed: e.processed, useful: Math.max(e.proposals, usefulInList) }
      : { total: list.total, noise: list.noise, archived: list.archived, processed: list.processed, useful: usefulInList };
  }, [q.data, exact.data, cardOf, narrowed]);

  const rows = useMemo(() => {
    const all = q.data ?? [];
    const needle = search.trim().toLocaleUpperCase("tr-TR");
    return all.filter(
      (d) =>
        (filter === "all" || (filter === "useful" ? cardOf.has(d.disclosure_index) : fateOf(d) === filter)) &&
        (!needle || (tickerOf(d) ?? "").includes(needle) || d.company_name.toLocaleUpperCase("tr-TR").includes(needle)),
    );
  }, [q.data, search, filter, cardOf]);
  const worthwhile = useMemo(() => (q.data ?? []).filter((d) => cardOf.has(d.disclosure_index)), [q.data, cardOf]);
  const capped = (q.data?.length ?? 0) >= MAX_DISCLOSURES;

  const pickDay = (next: string) => {
    setFilters({ ...filters, day: next, open: null });
    setShown(PAGE);
    setFilter("all");
  };
  const sentence = counts && day ? readingSentence({ total: counts.total, useful: counts.useful, day, today }) : q.error && !q.data ? "Duyuruları şu an getiremedim." : "Duyuruları getiriyorum…";

  return (
    <div className="ok-screen">
      <PageHeader
        name="Okunanlar"
        title={sentence}
        lead={
          <p>
            Bildirim ya da duyuru, borsadaki bir şirketin yasa gereği herkese açıkladığı haberdir; <Term word="KAP">KAP</Term> adlı resmî sitede yayımlanır. KAPtan hepsini senin yerine okur. <Link href="/onemli" className="underline underline-offset-4">Günün önemli duyurularına bak.</Link> <Link href="/takvim" className="underline underline-offset-4">Yaklaşan tarihler için takvime bak.</Link>
          </p>
        }
      />

      <ReadingBar saved={savedView} onSaved={setSavedView} />
      {savedView ? <SavedList onOpen={(open) => setFilters({ ...filters, open })} /> : null}

      {!savedView && q.error && !q.data ? (
        <ScreenState kind="error" title="Bağlantı kurulamadı." onRetry={q.refetch}>
          {q.error} Okuma sürüyor; yalnızca şu an gösteremiyorum.
        </ScreenState>
      ) : null}

      {!savedView && !q.data && !q.error ? <FunnelLoading /> : null}

      {!savedView && counts && q.data ? (
        <>
          <FilterBar key={filtersToQuery({ ...filters, open: null })} filters={filters} today={today} onChange={(next) => { setShown(PAGE); setFilters(next); }} />
          <Funnel counts={counts} filter={filter} onFilter={(f) => { setFilter(f); setShown(PAGE); }} />
          <WaitingLines
            note={waitingNote({
              deferred: exact.data ? deferredCount(exact.data) : 0,
              reason: exact.data?.deferred_reason_tr ?? null,
              waitingForMoney: Boolean(exact.data?.waiting_for_money),
              isToday: day === today,
            })}
          />
          {day && today ? (
            <div role="group" aria-label="Gün seç" className="ok-days">
              <Button variant="link" onClick={() => pickDay(prevTradingDay(day))}>
                ← Önceki borsa günü
              </Button>
              <Button variant="link" disabled={day >= today} onClick={() => pickDay(nextTradingDay(day) > today ? today : nextTradingDay(day))}>
                Sonraki borsa günü →
              </Button>
            </div>
          ) : null}
          {counts.total === 0 ? (
            <ScreenState kind="empty" title={day === today ? "Henüz okunacak bir şey yok." : "Bu gün sessiz geçti."} action={day ? <Button onClick={() => pickDay(prevTradingDay(day))}>← Önceki borsa gününe bak</Button> : null}>
              Şirketler açıklama yaptıkça buraya düşer. Sen bir şey yapmak zorunda değilsin.
            </ScreenState>
          ) : (
            <>
              {filter === "all" && !search.trim() && worthwhile.length ? <Worthwhile rows={worthwhile} cardOf={cardOf} isToday={day === today} /> : null}
              <section aria-labelledby="bildirim-listesi" className="ok-all">
                <div className="ok-all-head">
                  <h2 id="bildirim-listesi" className="u-chapter text-ink">
                    {filter === "all" ? "Okuduğum her şey" : `${fmtInt(rows.length)} duyuru`}
                  </h2>
                  <label className="block w-full sm:w-[280px]">
                    <span className="sr-only">Hisse ya da şirket ara</span>
                    <Input
                      type="search"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setShown(PAGE);
                      }}
                      placeholder="Şirket ara: THYAO, Aselsan…"
                    />
                  </label>
                </div>
                {rows.length ? (
                  <>
                    <DisclosureHours rows={rows.slice(0, shown)} label="Bildirim listesi" cardOf={cardOf} onOpen={(open) => setFilters({ ...filters, open })} />
                    {rows.length > shown ? (
                      <div className="ok-more">
                        <p className="text-dense text-muted tabular-nums">
                          {fmtInt(rows.length)} duyurudan {fmtInt(shown)} tanesi burada
                        </p>
                        <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
                          {fmtInt(Math.min(PAGE, rows.length - shown))} tane daha göster
                        </Button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <ScreenState
                    kind="empty"
                    title="Bu aramaya uyan duyuru yok."
                    action={
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSearch("");
                          setFilter("all");
                        }}
                      >
                        Hepsini göster
                      </Button>
                    }
                  >
                    Şirketin adını ya da kısa kodunu yazabilirsin.
                  </ScreenState>
                )}
                {capped ? <p className="mt-3 text-dense text-muted">En yeni {fmtInt(MAX_DISCLOSURES)} duyuru burada; gün bundan uzun.</p> : null}
              </section>
            </>
          )}
        </>
      ) : null}
      {filters.open ? <ReadingDrawer index={filters.open} onClose={() => setFilters({ ...filters, open: null })} /> : null}
    </div>
  );
}

/** What was read but got no turn, and why; always mounted so a change is read out politely. */
function WaitingLines({ note }: { note: WaitingNote }) {
  return (
    <div role="status" className="ok-waiting">
      {note.deferred ? (
        <p>
          <span className="ok-waiting-what">{note.deferred.text}</span>
          {note.deferred.reason ? ` ${note.deferred.reason}` : null}
        </p>
      ) : null}
      {note.money ? (
        <p>
          {note.money.text}{" "}
          <Link href={HOME} className="ok-waiting-link">
            {note.money.link}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/** While the day arrives: the boat waits on the water. */
function FunnelLoading() {
  return (
    <>
      <ScreenState kind="loading" title="Bugünün yığınına bakıyorum…">
        Yüzlerce duyuru arasından sana yarayabilecekleri ayırıyorum.
      </ScreenState>
      <div aria-hidden className="pf-water" />
    </>
  );
}
