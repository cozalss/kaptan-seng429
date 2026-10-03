/**
 * Tiny in-memory pub/sub with SSE-like envelopes ({ id, event, data }).
 * The mock API publishes here; `useEventStream` subscribes. In http mode the hook uses
 * EventSource instead and this bus is unused.
 */
export type StreamKey = "feed" | "desk" | `run:${string}`;

export interface BusMessage {
  id: string;
  event: string;
  data: unknown;
}

type Handler = (msg: BusMessage) => void;

export class EventBus {
  private readonly handlers = new Map<StreamKey, Set<Handler>>();
  private seq = 0;

  subscribe(key: StreamKey, handler: Handler): () => void {
    const set = this.handlers.get(key) ?? new Set<Handler>();
    set.add(handler);
    this.handlers.set(key, set);
    return () => {
      set.delete(handler);
      if (set.size === 0) this.handlers.delete(key);
    };
  }

  emit(key: StreamKey, event: string, data: unknown): BusMessage {
    this.seq += 1;
    const msg: BusMessage = { id: `${Date.now()}-${this.seq}`, event, data };
    for (const h of this.handlers.get(key) ?? []) {
      try {
        h(msg);
      } catch {
        // A failing subscriber must not break the publisher or other subscribers.
      }
    }
    return msg;
  }

  listenerCount(key: StreamKey): number {
    return this.handlers.get(key)?.size ?? 0;
  }
}
