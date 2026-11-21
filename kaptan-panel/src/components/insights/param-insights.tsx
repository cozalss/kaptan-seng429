"use client";

import { useApiQuery } from "@/lib/api/react";
import { AllocationBlock } from "./allocation-block";
import { ClosedTradesBlock } from "./closed-trades-block";
import { DividendsBlock } from "./dividends-block";
import { NotesBlock } from "./notes-block";
import { StatsBlock } from "./stats-block";

/**
 * What Param says about your own money beyond the holdings list: where it stands (and your limit for one share), the
 * shares you sold, return and risk, dividend income, and your private notes. Every block is derived on the backend from
 * the ledger and hides itself when there is nothing honest to say. `reloadKey` changes when a fill or a record changes.
 */
export function ParamInsights({ reloadKey }: { reloadKey: string }) {
  const allocation = useApiQuery((api) => api.insightsAllocation(), [reloadKey]);
  const closed = useApiQuery((api) => api.closedTrades(), [reloadKey]);
  const stats = useApiQuery((api) => api.returnStats(), [reloadKey]);
  const versus = useApiQuery((api) => api.versusMoney(), [reloadKey]);
  const dividends = useApiQuery((api) => api.dividendIncome(), [reloadKey]);
  const notes = useApiQuery((api) => api.holdingNotes(), [reloadKey]);

  return (
    <>
      <AllocationBlock data={allocation.data} onChanged={() => void allocation.refetch()} />
      <ClosedTradesBlock data={closed.data} />
      <StatsBlock stats={stats.data} versus={versus.data} />
      <DividendsBlock data={dividends.data} />
      <NotesBlock holdings={(allocation.data?.holdings ?? []).map((h) => ({ ticker: h.ticker, company: h.company }))} notes={notes.data?.notes} onChanged={() => void notes.refetch()} />
    </>
  );
}
