"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { DeskEvent, FeedEvent, RunEvent } from "@/lib/domain/events";
import { API_MODE } from "@/lib/api/config";
import { getMockDb } from "@/lib/api/mock/db";
import type { BusMessage, StreamKey } from "./bus";

/**
 * Subscribe to an SSE stream (04 §11): "feed", "desk" or a run's node stream.
 * - mock: subscribes to the in-memory bus the mock API publishes to;
 * - http: POST /sse/ticket (60 s, single use, 09 §6) → EventSource; on error it backs off
 *   (1 s → 15 s) and reconnects with the last event id.
 * Handlers are typed per event and may change between renders without resubscribing.
 */
type EventsOf<U extends { event: string; data: unknown }> = {
  [K in U["event"]]?: (data: Extract<U, { event: K }>["data"]) => void;
};

export type FeedHandlers = EventsOf<FeedEvent>;
export type DeskHandlers = EventsOf<DeskEvent>;
export type RunHandlers = EventsOf<RunEvent>;

export type StreamStatus = "connecting" | "open" | "reconnecting" | "closed";

type StreamArg = "feed" | "desk" | { run: string };

const SCHEMA = { feed: FeedEvent, desk: DeskEvent, run: RunEvent } as const;

function keyOf(s: StreamArg): StreamKey {
  return typeof s === "string" ? s : `run:${s.run}`;
}

function kindOf(s: StreamArg): keyof typeof SCHEMA {
  return typeof s === "string" ? s : "run";
}

export function useEventStream(stream: "feed", handlers: FeedHandlers): StreamStatus;
export function useEventStream(stream: "desk", handlers: DeskHandlers): StreamStatus;
export function useEventStream(stream: { run: string }, handlers: RunHandlers): StreamStatus;
export function useEventStream(stream: StreamArg, handlers: Record<string, ((data: never) => void) | undefined>): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>(API_MODE === "mock" ? "open" : "connecting");
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });
  const key = keyOf(stream);
  const kind = kindOf(stream);

  useEffect(() => {
    const dispatch = (msg: BusMessage) => {
      const parsed = (SCHEMA[kind] as z.ZodType<{ event: string; data: unknown }>).safeParse({ event: msg.event, data: msg.data });
      if (!parsed.success) return; // Unknown or malformed events are ignored, never thrown.
      const h = handlersRef.current[parsed.data.event] as ((d: unknown) => void) | undefined;
      h?.(parsed.data.data);
    };

    if (API_MODE === "mock") {
      // The in-memory bus is always open; status stays "open" for the life of the tab.
      return getMockDb().bus.subscribe(key, dispatch);
    }

    let es: EventSource | null = null;
    let lastId = "";
    let attempt = 0;
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const path = key.startsWith("run:") ? `runs/${encodeURIComponent(key.slice(4))}` : key;

    const connect = async () => {
      try {
        const res = await fetch("/api/v1/sse/ticket", { method: "POST", credentials: "include" });
        if (!res.ok) throw new Error("ticket");
        const { ticket } = z.object({ ticket: z.string() }).parse(await res.json());
        if (stopped) return;
        const params = new URLSearchParams({ ticket, ...(lastId ? { last_event_id: lastId } : {}) });
        es = new EventSource(`/api/v1/stream/${path}?${params.toString()}`);
        es.onopen = () => {
          attempt = 0;
          setStatus("open");
        };
        es.onerror = () => {
          es?.close();
          schedule();
        };
        const names = (SCHEMA[kind] as unknown as { options: Array<{ shape: { event: { value: string } } }> }).options.map(
          (o) => o.shape.event.value,
        );
        for (const name of names) {
          es.addEventListener(name, (ev) => {
            const me = ev as MessageEvent<string>;
            lastId = me.lastEventId || lastId;
            try {
              dispatch({ id: lastId, event: name, data: JSON.parse(me.data) });
            } catch {
              // Malformed JSON from the stream is dropped.
            }
          });
        }
      } catch {
        schedule();
      }
    };
    const schedule = () => {
      if (stopped) return;
      setStatus("reconnecting");
      attempt += 1;
      retryTimer = setTimeout(() => void connect(), Math.min(15_000, 1_000 * 2 ** (attempt - 1)));
    };
    void connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
      setStatus("closed");
    };
  }, [key, kind]);

  return status;
}
