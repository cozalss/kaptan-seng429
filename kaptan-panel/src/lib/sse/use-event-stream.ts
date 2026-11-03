"use client";

import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { DeskEvent, FeedEvent, RunEvent } from "@/lib/domain/events";
import { API_MODE } from "@/lib/api/config";
import { localRuntime } from "@/lib/api/local-runtime";
import type { BusMessage, StreamKey } from "./bus";
import { subscribeShared } from "./shared-stream";

/**
 * Subscribe to an SSE stream (04 §11): "feed", "desk" or a run's node stream.
 * - test double: subscribes to the in-memory bus the mock API publishes to (local-runtime.ts);
 * - http: one EventSource per stream shared by the whole tab (shared-stream.ts: ticket,
 *   back-off and reconnect with the last event id live there).
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
      return localRuntime()?.subscribe(key, dispatch);
    }

    // http: one shared EventSource per stream for the whole tab (shared-stream.ts).
    const names = (SCHEMA[kind] as unknown as { options: Array<{ shape: { event: { value: string } } }> }).options.map((o) => o.shape.event.value);
    const unsubscribe = subscribeShared(key, names, { onMessage: dispatch, onStatus: setStatus });
    return () => {
      unsubscribe();
      setStatus("closed");
    };
  }, [key, kind]);

  return status;
}
