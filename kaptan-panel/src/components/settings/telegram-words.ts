import type { TelegramLevel, TelegramStatus } from "@/lib/domain/telegram";

/** The words of Ayarlar · Telegram, in one place so tests can read them. No "durdur": nothing here stops KAPtan. */
export const TELEGRAM_LEAD =
  "Önemli duyurular telefonuna şirketin adı ve tek satırlık bir açıklamayla gelir. Paranı, adedini ya da kârını hiç yazmam. Bilgisayar kapalıyken haber veremem; açılınca kaç saat kapalı kaldığımı ve o sürede ne olduğunu yazarım.";

/** With the cloud watcher on, the computer being off is no longer the problem: the cloud sends the messages. */
export const TELEGRAM_LEAD_CLOUD =
  "Önemli duyurular telefonuna şirketin adı ve tek satırlık bir açıklamayla gelir. Paranı, adedini ya da kârını hiç yazmam. Bilgisayarın kapalıyken de duyuruları ve sabah özetini bulut gönderir.";

export const TELEGRAM_STEPS = {
  one: "Telegram’da @BotFather’ı aç ve /newbot yaz. Bir ad seçince sana uzun bir bot kodu verir.",
  two: "Bot kodunu buraya yapıştır ve Kaydet’e bas.",
  three: "Bağla’ya bas.",
  four: "Çıkan bağlantıya telefonundan dokun ve Telegram’da Start’a bas.",
} as const;

export const BOTFATHER_URL = "https://t.me/BotFather";

export function telegramSentence(s: TelegramStatus | null): string {
  if (s === null) return "Telegram’a bakıyorum…";
  if (s.paired) return "Telefonuna Telegram’dan haber veriyorum.";
  if (s.pairing_open) return "Telefonundan bağlantıya dokunmanı bekliyorum.";
  return "Telefonuna Telegram’dan haber verebilirim.";
}

export const LEVELS: readonly TelegramLevel[] = ["less", "normal", "more"];
export const LEVEL_LABEL: Readonly<Record<TelegramLevel, string>> = {
  less: "Daha az",
  normal: "Normal",
  more: "Daha çok",
};
export const LEVEL_HINT: Readonly<Record<TelegramLevel, string>> = {
  less: "Yalnızca elindeki hisselerin olumlu ya da olumsuz haberleri anında gelir; gerisi sabah mesajında.",
  normal: "Elindeki ve izlediğin hisselerin önemli duyuruları anında gelir; gerisi sabah mesajında.",
  more: "İzlediğin hisselerin önemsiz duyuruları da anında gelir.",
};

export const CAP_CHOICES = [3, 5, 8, 12, 20] as const;
export const SAMPLE_BUTTON = "Telefonuma mesaj gönder";
export const UNLINK_BUTTON = "Bağlantıyı kaldır";
export const CONNECTED_DETAIL =
  "Telegram’da /sessiz yazarsan sabaha kadar anlık mesaj göndermem, /ayar ile Daha az / Daha çok seçersin, /durum bugünün sayılarını verir.";

export function capSentence(n: number): string {
  return `Günde en fazla ${n} anlık mesaj. Fazlası sabah mesajına kalır.`;
}

// ── Bulut takibi ─────────────────────────────────────────────────────────────

export const CLOUD_TITLE = "Bulut takibi";
export const CLOUD_ON_LEAD =
  "Bilgisayarın kapalıyken de duyuruları ve sabah özetini bulut Telegram’a gönderir. Alım ya da satım önerisi için ve web sitesi için bilgisayarın açık olması gerekir.";
export const CLOUD_SETUP_SUMMARY = "Bilgisayar kapalıyken de haber almak ister misin?";
export const CLOUD_SETUP_LEAD =
  "Ücretsiz ve kartsız bir bulut programı duyuruları senin yerine izler. Üç şey yaparsın, gerisini kurulum betiği yapar:";
export const CLOUD_SETUP_STEPS = {
  one: "Cloudflare’de hesap aç (yalnız e-posta yeter, kart istemez): dash.cloudflare.com/sign-up",
  two: "KAPtan klasöründe PowerShell’de .\\cloud-watcher\\kur-bulut.ps1 yaz.",
  three: "Açılan tarayıcıda “Allow” (İzin ver) düğmesine bas.",
} as const;
export const CLOUD_KAP_BLOCKED =
  "KAP, bulutun adreslerini engelliyor gibi görünüyor. Bilgisayar kapalıyken duyuru takibi çalışmayabilir; bilgisayar açıkken her şey çalışır.";
export const CLOUD_KAP_UNKNOWN = "KAP’a buluttan ulaşılıp ulaşılamadığını henüz öğrenemedim.";
export const CLOUD_ERROR = "Buluta son ulaşışım olmadı. Bilgisayarın internete bağlı olduğundan emin ol; kendiliğinden yeniden dener.";

/** "az önce", "12 dakika önce", "3 saat önce", else the date. `nowMs` is a parameter so tests can fix it. */
export function agoWords(iso: string | null, nowMs: number): string {
  if (iso === null) return "henüz yok";
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dakika önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

export function cloudSentence(s: TelegramStatus): string {
  return s.cloud_on ? "Bulut takibi açık." : "Bulut takibi kapalı.";
}

/** The one warning the cloud block may show (null: everything is as it should be). */
export function cloudWarning(s: TelegramStatus): string | null {
  if (!s.cloud_on) return null;
  if (s.cloud_error) return CLOUD_ERROR;
  if (s.cloud_kap === "blocked") return CLOUD_KAP_BLOCKED;
  if (s.cloud_kap === "unknown" || s.cloud_kap === "error") return CLOUD_KAP_UNKNOWN;
  return null;
}
