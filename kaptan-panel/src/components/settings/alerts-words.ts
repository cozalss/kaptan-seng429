import type { AlertSettings } from "@/lib/domain";
import type { AlertPermission } from "@/lib/alerts/alerts";
import { fmtShortDate, fmtTime } from "@/lib/format";
import { locative } from "@/components/story/turkish";

/**
 * The words of Ayarlar · Bildirimler, as pure functions: whether KAPtan can reach you, what each
 * channel is doing, and what the last message came to.
 */
export const ALERTS_LEAD =
  "Yeni bir önerin olduğunda, günlük zarar sınırına gelindiğinde ya da KAPtan durduğunda haber veririm. Mesajda hisse adı da tutar da yazmaz: kararın kimseyle paylaşılmaz.";

/** The installer's file, and the app the phone needs. The steps below must match what the installer says. */
export const INSTALLER_FILE = "kur.cmd";
export const PHONE_APP = "ntfy";

/** Setting up the phone, in three steps (shown while no phone or e-mail channel is set up). */
export const PHONE_SETUP_STEPS: readonly string[] = [
  `Telefonuna ücretsiz ${PHONE_APP} uygulamasını kur.`,
  `Bu bilgisayarda KAPtan klasöründeki ${INSTALLER_FILE} dosyasını yeniden çalıştır. Sana bir konu adı gösterir.`,
  `Telefondaki ${PHONE_APP} uygulamasında “konuya abone ol”a dokun ve o konu adını yaz.`,
];
export const PHONE_SETUP_AFTER = "Sonra bu sayfayı yenile: burada bir deneme bildirimi gönderebilirsin.";

export const TEST_BUTTON = "Deneme bildirimi gönder";

/** The block's one sentence. `settings` null = the API has not said yet (or cannot). */
export function alertsSentence(desktopOn: boolean, settings: AlertSettings | null): string {
  if (desktopOn || settings?.ntfy || settings?.email) return "Öneri gelince sana haber veriyorum.";
  return settings ? "Sana henüz haber veremiyorum." : "Sana nasıl haber vereyim?";
}

export interface DesktopWords {
  state: string;
  detail: string;
  /** The button, or null when the browser cannot do it at all. */
  action: "Bu bilgisayarda aç" | "Kapat" | "Yeniden dene" | null;
}

/** "Bu bilgisayar": the browser's own notifications. */
export function desktopWords(on: boolean, permission: AlertPermission): DesktopWords {
  if (permission === "unsupported") {
    return { state: "Bu tarayıcı bildirim gösteremiyor.", detail: "Telefon ve e-posta bildirimi bundan etkilenmez.", action: null };
  }
  if (permission === "denied") {
    return {
      state: "Tarayıcı izin vermiyor.",
      detail: "Adres çubuğunun başındaki simgeye tıkla, “Bildirimler”i “İzin ver” yap, sonra yeniden dene.",
      action: "Yeniden dene",
    };
  }
  if (on) {
    return { state: "Açık.", detail: "KAPtan başka bir pencerenin arkasındayken ekranın köşesinde haber veririm. KAPtan bir sekmede açık kaldıkça çalışır.", action: "Kapat" };
  }
  return { state: "Kapalı.", detail: "Açarsan tarayıcı senden izin ister. KAPtan bir sekmede açık kaldıkça çalışır.", action: "Bu bilgisayarda aç" };
}

export function channelWords(kind: "ntfy" | "email", settings: AlertSettings | null, error: string | null): { state: string; detail: string | null } {
  if (!settings) return error ? { state: "Şu an öğrenemedim.", detail: error } : { state: "Bakıyorum…", detail: null };
  if (!settings[kind]) return { state: "Kurulu değil.", detail: null };
  return kind === "ntfy" ? { state: "Kurulu.", detail: `Telefonundaki ${PHONE_APP} uygulamasına bildirim gider.` } : { state: "Kurulu.", detail: "E-posta adresine bildirim gider." };
}

export interface LastResult {
  ok: boolean;
  text: string;
}

/** What the last message came to: the failure first (it is what needs attention), else when one last went out. */
export function lastResult(settings: AlertSettings): LastResult | null {
  if (settings.last_error_tr) return { ok: false, text: `Son bildirim gitmedi: ${settings.last_error_tr}` };
  if (settings.last_sent_at) return { ok: true, text: `Son bildirim ${fmtShortDate(settings.last_sent_at)} ${locative(fmtTime(settings.last_sent_at))} gönderildi.` };
  return null;
}

/** Right after a test: what to expect, in the person's terms. */
export function testOutcome(settings: AlertSettings): LastResult {
  if (settings.last_error_tr) return { ok: false, text: settings.last_error_tr };
  return { ok: true, text: "Deneme bildirimi gönderildi. Birkaç saniye içinde sana ulaşmalı." };
}
