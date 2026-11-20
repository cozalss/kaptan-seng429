import { ALERT_TITLE, shouldNotify, type AlertPermission, type DesktopAlert } from "./alerts";

/**
 * Desktop alerts, the browser part: the person's choice (kept in this browser), the browser's
 * permission (asked only when they turn alerts on) and the notification itself. Works only
 * while KAPtan is open in a tab: the events come over the panel's own stream.
 */
const PREF_KEY = "kaptan_desktop_alerts";

const listeners = new Set<() => void>();
const changed = () => {
  for (const fn of listeners) fn();
};

/** For `useSyncExternalStore`: the choice or the permission changed. */
export function subscribeDesktopAlerts(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function desktopPermission(): AlertPermission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function wanted(): boolean {
  try {
    return window.localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function setWanted(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(PREF_KEY, "1");
    else window.localStorage.removeItem(PREF_KEY);
  } catch {
    // Storage blocked (private mode): the choice lasts until the tab closes, which is nothing; say so by staying off.
  }
  changed();
}

/** On = the person chose it here and the browser still allows it. */
export function desktopAlertsOn(): boolean {
  return wanted() && desktopPermission() === "granted";
}

/** The person pressed "aç": ask the browser now (never earlier) and remember the choice if it agrees. */
export async function turnOnDesktopAlerts(): Promise<AlertPermission> {
  if (typeof Notification === "undefined") return "unsupported";
  let permission: AlertPermission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = Notification.permission;
    }
  }
  setWanted(permission === "granted");
  return permission;
}

export function turnOffDesktopAlerts(): void {
  setWanted(false);
}

/** The person has the app in front of them: the screen itself tells them. */
function looking(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

/**
 * Show the alert if it may be shown; a click brings the window forward and opens the alert's
 * screen. One notification per kind (a newer one replaces it). Returns whether it was shown.
 */
export function raiseDesktopAlert(alert: DesktopAlert, open: (path: string) => void): boolean {
  if (!shouldNotify({ enabled: wanted(), permission: desktopPermission(), looking: looking() })) return false;
  try {
    const n = new Notification(ALERT_TITLE, { body: alert.body, tag: `kaptan-${alert.kind}`, lang: "tr" });
    n.onclick = () => {
      window.focus();
      open(alert.path);
      n.close();
    };
    return true;
  } catch {
    // Some browsers only allow notifications from a service worker: no alert, and nothing breaks.
    return false;
  }
}
