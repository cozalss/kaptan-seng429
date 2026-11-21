/**
 * The words and arithmetic of the Param insights that the test double and the screen share (the backend does the same
 * in `insights/*`; the sentences are identical so the double reads like the real thing).
 */
export const UNKNOWN_SECTOR = "Sektörü bilinmiyor";
export const MSG_NEED_TWO_CLOSES = "En az iki borsa günü kapanışı gerekiyor; ondan sonra yazarım.";
export const MSG_NO_OFFICIAL = "Resmi veri bu bilgisayara bağlı değil; tahmin yazmıyorum.";
export const MSG_NO_DOLLAR = "Bu günler için kayıtlı kur yok.";
export const MSG_HAND_DAYS = "Elle eklediğin hisselerde alış günü bilinmediği için elde tutma süresini yazmadım.";
export const MSG_FEW_SALES = "Henüz çok az satış var; kazanma oranı için erken.";
export const MSG_NOT_IN_BOOK = "Bu hisse defterinde yok.";
export const MSG_NO_NOTE = "Bu hisse için yazılmış bir not yok.";

const comma = (n: number) => String(n).replace(".", ",");

/** Percent number (41.3) in Turkish: "41,3". */
export const pctText = (n: number): string => comma(Math.round(n * 10) / 10);

/** "Paranın %41'i tek hissede (ORNEK). Sınırın %25." when the biggest share is over the person's limit. */
export function concentrationWarning(top: { ticker: string; pct: number } | null, limit: number): string | null {
  if (top === null || top.pct <= limit) return null;
  return `Paranın %${pctText(top.pct)}'i tek hissede (${top.ticker}). Sınırın %${comma(limit)}.`;
}
