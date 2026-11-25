/** A section saved something: the group summaries above it look again at the server. */
const EVENT = "kaptan:settings-changed";

export function announceSettingsChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function onSettingsChanged(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
