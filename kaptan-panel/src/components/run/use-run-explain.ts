"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Explain, NodeName } from "@/lib/domain";
import { NODE_LABELS } from "@/lib/domain";
import { useApi } from "@/lib/api/react";
import { errorMessage, isApiError } from "@/lib/api/types";
import { useEventStream, type StreamStatus } from "@/lib/sse/use-event-stream";
import { fmtTime } from "@/lib/format";
import { currentTimeMs } from "@/lib/clock";
import { applyNodeEvent, mergeLive, type LiveMap } from "./trace-layout";

/**
 * Loads GET /runs/{id}/explain and keeps it live: node events from /stream/runs/{id} are laid
 * over the trace immediately, and the payload is refetched when a node ends, on interrupt()
 * and on done. While the run is still "running" it also polls (another tab may own the SSE).
 */
export interface RunError {
  status: number;
  message: string;
}

export interface LogLine {
  id: number;
  at: string;
  text: string;
}

export interface RunExplainState {
  data: Explain | undefined;
  error: RunError | null;
  loading: boolean;
  stream: StreamStatus;
  log: LogLine[];
  interrupted: string | null;
  refetch: () => Promise<void>;
}

export const POLL_MS = 1_200;
const LOG_MAX = 8;

export function useRunExplain(runId: string): RunExplainState {
  const api = useApi();
  const [data, setData] = useState<Explain | undefined>(undefined);
  const [error, setError] = useState<RunError | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState<LiveMap>({});
  const [log, setLog] = useState<LogLine[]>([]);
  const [interrupted, setInterrupted] = useState<string | null>(null);
  const seq = useRef(0);
  const logId = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    await Promise.resolve();
    try {
      const e = await api.explain(runId);
      if (mine !== seq.current) return;
      setData(e);
      setError(null);
    } catch (err) {
      if (mine !== seq.current) return;
      setError({ status: isApiError(err) ? err.status : 500, message: errorMessage(err) });
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [api, runId]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  const push = useCallback((at: string, text: string) => {
    logId.current += 1;
    const line = { id: logId.current, at, text };
    setLog((l) => [line, ...l].slice(0, LOG_MAX));
  }, []);

  const stream = useEventStream(
    { run: runId },
    {
      node: (ev) => {
        setLive((m) => applyNodeEvent(m, ev));
        push(ev.at, `${NODE_LABELS[ev.node as NodeName].tr} ${ev.phase === "start" ? "başladı" : "bitti"}`);
        if (ev.phase === "end") void load();
      },
      interrupt: (ev) => {
        setInterrupted(ev.proposal_id);
        push(new Date(currentTimeMs()).toISOString(), "interrupt() → onay bekliyor");
        void load();
      },
      done: (ev) => {
        push(new Date(currentTimeMs()).toISOString(), `bitti · ${ev.outcome ?? ev.status}`);
        void load();
      },
    },
  );

  const running = data?.run.status === "running";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [running, load]);

  const merged = useMemo<Explain | undefined>(() => {
    if (!data) return undefined;
    if (Object.keys(live).length === 0) return data;
    return { ...data, trace: { ...data.trace, nodes: mergeLive(data.trace.nodes, live) } };
  }, [data, live]);

  return { data: merged, error, loading, stream, log, interrupted, refetch: load };
}

/** "13:41:22" for the live log. */
export function logTime(iso: string): string {
  try {
    return fmtTime(iso, true);
  } catch {
    return "—";
  }
}
