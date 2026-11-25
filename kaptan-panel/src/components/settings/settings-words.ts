import type { TelegramStatus } from "@/lib/domain/telegram";
import type { AlertPrefs, BackupStatus, Pause } from "@/lib/domain";
import { TEXT_LABEL, THEME_LABEL, type Look } from "@/lib/prefs/look";
import { fmtShortDate } from "@/lib/format";

/** The words of the Ayarlar groups: one line of current state per group, and the reset dialog. Pure, so tests read them. */

export interface NotifyState {
  telegram: TelegramStatus | null;
  desktopOn: boolean;
  alerts: AlertPrefs | null;
  pause: Pause | null;
}

/** "Telegram bağlı değil · Masaüstü bildirimleri açık · Sessiz saatler 23:00–08:00". */
export function notifySummary(s: NotifyState): string {
  const parts = [
    s.telegram === null ? "Telegram’a bakıyorum…" : s.telegram.paired ? "Telegram bağlı" : "Telegram bağlı değil",
    s.desktopOn ? "Masaüstü bildirimleri açık" : "Masaüstü bildirimleri kapalı",
  ];
  if (s.alerts) parts.push(s.alerts.quiet.on ? `Sessiz saatler ${s.alerts.quiet.start}–${s.alerts.quiet.end}` : "Sessiz saat yok");
  if (s.alerts && s.alerts.muted.length > 0) parts.push(`${s.alerts.muted.length} şirket susturuldu`);
  if (s.pause?.active) parts.push("Tatil modu açık");
  return parts.join(" · ");
}

export function moneySummary(limitCount: number | null): string {
  if (limitCount === null) return "Sınırlarına bakıyorum…";
  if (limitCount === 0) return "Henüz bir sınırın yok";
  return `${limitCount} sınır seni koruyor`;
}

export function lookSummary(look: Look): string {
  return `Tema: ${THEME_LABEL[look.theme]} · Yazı: ${TEXT_LABEL[look.text]}`;
}

export function accountSummary(backup: BackupStatus | null, problems: number | null): string {
  const b = !backup ? "Yedeğe bakıyorum…" : backup.state !== "idle" ? "Yedek alınıyor" : backup.last_at ? `Son yedek ${fmtShortDate(backup.last_at)}` : "Henüz yedek yok";
  const p = problems === null ? null : problems === 0 ? "Sistem sağlıklı" : `Sistemde ${problems} uyarı var`;
  return p ? `${b} · ${p}` : b;
}

export const RESET_BUTTON = "Ayarları sıfırla";
export const RESET_TITLE = "Ayarları sıfırlayayım mı?";
export const RESET_WILL = [
  "Bildirim türleri ve sessiz saatler",
  "Susturduğun şirketler",
  "Tatil modu",
  "Telegram’daki Daha az / Daha çok seçimi ve günlük mesaj sınırı (Normal ve 8 olur; Telegram bağlı kalır)",
  "Bu bilgisayarın masaüstü bildirimleri",
  "Tema ve yazı boyutu (cihaz gibi ve normal olur)",
  "“KAPtan nasıl çalışır?” yeniden gösterilir",
] as const;
export const RESET_WONT = "Değişmeyenler: paran, elindeki hisseler, kayıp sınırların, parolan, geçmiş, Telegram bağlantın ve yedeklerin.";
export const RESET_PERMISSION =
  "Tarayıcının bildirim iznini bir site geri alamaz. İstersen adres çubuğunun başındaki simgeden “Bildirimler”i kapatabilirsin.";
export const RESET_CONFIRM = "Evet, sıfırla";
export const RESET_DONE = "Ayarlar varsayılana döndü.";

export const GROUP = {
  notify: { id: "telefon-bildirim", name: "Telefon ve bildirimler" },
  money: { id: "para-sinir", name: "Param ve sınırlar" },
  look: { id: "gorunum", name: "Görünüm" },
  account: { id: "hesap-yedek", name: "Hesap ve yedek" },
} as const;
