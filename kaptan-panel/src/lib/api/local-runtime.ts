import type { BusMessage, StreamKey } from "@/lib/sse/bus";

/**
 * What only the test double provides: its own clock and in-memory event bus. It registers itself
 * here (mock/register.ts), so the clock and the event hook never import mock code; a production
 * bundle has nothing registered and never asks.
 */
export interface LocalRuntime {
  nowMs(): number;
  subscribe(key: StreamKey, handler: (msg: BusMessage) => void): () => void;
}

let runtime: LocalRuntime | null = null;

export function registerLocalRuntime(next: LocalRuntime): void {
  runtime = next;
}

export function localRuntime(): LocalRuntime | null {
  return runtime;
}
