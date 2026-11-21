import type { ApprovalCard } from "@/lib/domain";
import { href, ROUTES } from "@/lib/nav";

/**
 * Desktop alerts, the pure part: which of the events the panel already receives is worth a
 * notification, what it says and where a click leads. The text never names a share, a company,
 * an amount or a direction: the same sentences the backend sends to the phone.
 */
export type AlertKind = "suggestion" | "watch" | "price";

export const ALERT_TITLE = "KAPtan";

export const ALERT_TEXT: Readonly<Record<AlertKind, string>> = {
  suggestion: "Yeni bir önerin var.",
  watch: "İzlediğin bir şirketten yeni bildirim var.",
  // A price alert stays on this computer, so its real text names the company (priceAlertBody); this is the generic one.
  price: "Bir fiyat uyarın tetiklendi.",
};

export interface DesktopAlert {
  kind: AlertKind;
  body: string;
  /** The screen a click brings forward. */
  path: string;
}

export type DeskSignal = { event: "approval.requested"; data: Pick<ApprovalCard, "proposal_id"> };

/** A new disclosure for a company on the watchlist; a click opens Okunanlar filtered to the watchlist. */
export const WATCH_ALERT: DesktopAlert = { kind: "watch", body: ALERT_TEXT.watch, path: `${ROUTES.bildirimler}?kimler=izlediklerim` };

const alertOf = (kind: AlertKind, path: string): DesktopAlert => ({ kind, body: ALERT_TEXT[kind], path });

/** The alert for a desk event, or null. */
export function alertFor(signal: DeskSignal): DesktopAlert | null {
  return alertOf("suggestion", href.proposal(signal.data.proposal_id));
}

export type AlertPermission = NotificationPermission | "unsupported";

/** Only after the person turned alerts on, with the browser's leave, and never over the app they are looking at. */
export function shouldNotify({ enabled, permission, looking }: { enabled: boolean; permission: AlertPermission; looking: boolean }): boolean {
  return enabled && permission === "granted" && !looking;
}
