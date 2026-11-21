import { AlertPrefs } from "@/lib/domain";
import type { AlertTopic } from "@/lib/domain";
import { defaultAlertPrefs } from "./alert-defaults";
import { desktopAllowed } from "./quiet";

/**
 * What this computer was last told about alerts (kept in this browser): which kinds may pop up here and the quiet
 * hours. The app refreshes it whenever it loads or the person saves (PrefsSync); a browser that never heard
 * anything uses the defaults, which allow everything.
 */
const KEY = "kaptan_alert_prefs";

export function rememberAlertPrefs(
  prefs: AlertPrefs,
  store: Pick<Storage, "setItem"> | null = safeStore(),
): void {
  try {
    store?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: the defaults apply.
  }
}

export function rememberedAlertPrefs(
  store: Pick<Storage, "getItem"> | null = safeStore(),
): AlertPrefs {
  try {
    const raw = store?.getItem(KEY);
    const parsed = raw ? AlertPrefs.safeParse(JSON.parse(raw)) : null;
    return parsed?.success ? parsed.data : defaultAlertPrefs();
  } catch {
    return defaultAlertPrefs();
  }
}

function safeStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The panel's alert kinds (lib/alerts/alerts.ts) as the topics of the preferences. */
export const TOPIC_OF_ALERT: Readonly<
  Record<"suggestion" | "price", AlertTopic>
> = {
  suggestion: "suggestion",
  price: "price",
};

export function mayShowOnThisComputer(
  kind: "suggestion" | "price",
  ms: number = Date.now(),
): boolean {
  return desktopAllowed(rememberedAlertPrefs(), TOPIC_OF_ALERT[kind], ms);
}

/** True when the person muted this company (Ayarlar · Şirket bazında sustur): no message outside the app for it. */
export function isMuted(ticker: string | null | undefined): boolean {
  return ticker != null && rememberedAlertPrefs().muted.includes(ticker);
}
