/** Remembers that "KAPtan nasıl çalışır" was shown, on this browser. */
export const HOWTO_KEY = "kaptan_howto_seen";

type Store = Pick<Storage, "getItem" | "setItem">;

/** A browser that refuses storage could not remember the answer, so it is not asked at every visit. */
export function hasSeenHowTo(store: Store): boolean {
  try {
    return store.getItem(HOWTO_KEY) === "1";
  } catch {
    return true;
  }
}

export function markHowToSeen(store: Store): void {
  try {
    store.setItem(HOWTO_KEY, "1");
  } catch {
    // Nothing to do: `hasSeenHowTo` already treats this browser as one that will not be asked again.
  }
}
