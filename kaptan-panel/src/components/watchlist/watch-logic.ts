import type { WatchItem } from "@/lib/company/company";

const DAY_MS = 86_400_000;

/** A watched company's newest disclosure is marked "yeni" for a day, if it came after the company was starred. Pure. */
export function isFresh(w: Pick<WatchItem, "added_at" | "newest_disclosure_at">, nowMs: number): boolean {
  if (!w.newest_disclosure_at) return false;
  const at = Date.parse(w.newest_disclosure_at);
  return at > Date.parse(w.added_at) && nowMs - at < DAY_MS;
}

/** "3 saat önce", "dün", "5 gün önce": the age of the newest disclosure in plain words. Pure. */
export function ageWords(iso: string | null, nowMs: number): string {
  if (!iso) return "Duyurusu yok";
  const ms = Math.max(0, nowMs - Date.parse(iso));
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Son duyuru: az önce";
  if (minutes < 60) return `Son duyuru: ${minutes} dakika önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Son duyuru: ${hours} saat önce`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Son duyuru: dün" : `Son duyuru: ${days} gün önce`;
}
