/**
 * The words of Durdur, in one place. Pure: the pending-proposal count is the only input, so a
 * quiet day ("no proposal waiting") never reads "bekleyen 0 öneri".
 */

/** Every written reason needs at least this many characters (the API's own rule). */
export const NOTE_MIN = 10;

export type Ask = "stop" | "start" | "confirm";

export interface AskCopy {
  title: string;
  lead: string;
  label: string;
  submit: string;
}

/** The paragraph under DURDUR while the desk runs. */
export function stopSectionLine(pending: number): string {
  const drop = pending > 0 ? `bekleyen ${pending} öneri düşer, ` : "";
  return (
    `Bir şey ters giderse Risk Sorumlusu ya da Yönetici her şeyi durdurur: ${drop}yeni öneri gelmez, ` +
    "girilmemiş fişler iptal olur. Elindekiler satılmaz; kendi çıkış günlerinde kapanır. Yeniden açmak iki kişi ister."
  );
}

/** What Durdur does, one plain line each (the list beside the button while the desk runs). */
export function stopEffects(pending: number): string[] {
  return [
    pending > 0 ? `Bekleyen ${pending} öneri düşer; yeni öneri gelmez.` : "Yeni öneri gelmez.",
    "Aracı kuruma girilmemiş fişler iptal olur.",
    "Elindekiler satılmaz; kendi çıkış günlerinde kapanır.",
  ];
}

/** What is true while the desk is stopped (the list under "Durduruldu."). */
export const STOPPED_EFFECTS = [
  "Yeni öneri gelmiyor; bekleyenler düştü.",
  "Girilmemiş fişler iptal edildi.",
  "Elindekiler satılmadı; kendi çıkış günlerinde kapanır.",
] as const;

/** The stop dialog's lead. */
export function stopDialogLead(pending: number): string {
  const first = pending > 0 ? `Bekleyen ${pending} öneri düşer, yeni öneri gelmez.` : "Yeni öneri gelmez.";
  return `${first} Geri açmak iki kişi ister: Yönetici başlatır, Risk Sorumlusu onaylar.`;
}

export function askCopy(ask: Ask, pending: number): AskCopy {
  switch (ask) {
    case "stop":
      return { title: "Her şeyi durdur", lead: stopDialogLead(pending), label: "Neden durduruyorsun?", submit: "Durdur" };
    case "start":
      return {
        title: "Yeniden başlatmayı başlat",
        lead: "Bu birinci imza (1/2). Sistem, Risk Sorumlusu onaylayınca açılır.",
        label: "Neden yeniden başlatılmalı?",
        submit: "Başlat (1/2)",
      };
    case "confirm":
      return {
        title: "Onayla ve yeniden başlat",
        lead: "Bu ikinci imza (2/2). Onaylarsan tayfa yeniden çalışır.",
        label: "Kısa notun",
        submit: "Onayla (2/2)",
      };
  }
}
