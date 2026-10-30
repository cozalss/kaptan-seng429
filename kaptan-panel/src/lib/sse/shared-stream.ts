import { z } from "zod";
import { repairDeep } from "@/lib/api/http/mojibake";
import type { BusMessage, StreamKey } from "./bus";

/**
 * One EventSource per stream for the whole tab (http mode). Every screen part that listens to
 * "desk" or "feed" shares it: browsers allow only six HTTP/1.1 connections per host, and one
 * EventSource per component used them all up, so ordinary API calls queued forever behind the
 * streams. POST /sse/ticket (60 s, single use, 09 §6) → EventSource; on error it backs off
 * (1 s → 15 s) and reconnects with the last event id. The connection closes a moment after
 * its last listener leaves (a route change re-subscribes without reconnecting).
 */
export type SharedStatus = "connecting" | "open" | "reconnecting" | "closed";

interface Listener {
  onMessage: (msg: BusMessage) => void;
  onStatus: (s: SharedStatus) => void;
}

interface Connection {
  listeners: Set<Listener>;
  status: SharedStatus;
  stop: () => void;
  closeTimer: ReturnType<typeof setTimeout> | null;
}

/** How long a stream stays open with nobody listening (covers a route change). */
const LINGER_MS = 2_000;

const connections = new Map<StreamKey, Connection>();

function open(key: StreamKey, eventNames: readonly string[]): Connection {
  const conn: Connection = { listeners: new Set(), status: "connecting", stop: () => undefined, closeTimer: null };
  let es: EventSource | null = null;
  let lastId = "";
  let attempt = 0;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const path = key.startsWith("run:") ? `runs/${encodeURIComponent(key.slice(4))}` : key;

  const setStatus = (s: SharedStatus) => {
    conn.status = s;
    for (const l of conn.listeners) l.onStatus(s);
  };
  const schedule = () => {
    if (stopped) return;
    setStatus("reconnecting");
    attempt += 1;
    retryTimer = setTimeout(() => void connect(), Math.min(15_000, 1_000 * 2 ** (attempt - 1)));
  };
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
      for (const name of eventNames) {
        es.addEventListener(name, (ev) => {
          const me = ev as MessageEvent<string>;
          lastId = me.lastEventId || lastId;
          let data: unknown;
          try {
            data = repairDeep(JSON.parse(me.data));
          } catch {
            return; // Malformed JSON from the stream is dropped.
          }
          for (const l of conn.listeners) l.onMessage({ id: lastId, event: name, data });
        });
      }
    } catch {
      schedule();
    }
  };
  conn.stop = () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    es?.close();
  };
  void connect();
  return conn;
}

/** Listen to a stream (opening it if nobody does yet). Returns the unsubscribe. */
export function subscribeShared(key: StreamKey, eventNames: readonly string[], listener: Listener): () => void {
  let conn = connections.get(key);
  if (!conn) {
    conn = open(key, eventNames);
    connections.set(key, conn);
  }
  if (conn.closeTimer) {
    clearTimeout(conn.closeTimer);
    conn.closeTimer = null;
  }
  conn.listeners.add(listener);
  listener.onStatus(conn.status);
  const mine = conn;
  return () => {
    mine.listeners.delete(listener);
    if (mine.listeners.size > 0) return;
    mine.closeTimer = setTimeout(() => {
      if (mine.listeners.size > 0) return;
      mine.stop();
      if (connections.get(key) === mine) connections.delete(key);
    }, LINGER_MS);
  };
}

/** Open streams right now (tests). */
export function openStreamCount(): number {
  return connections.size;
}
