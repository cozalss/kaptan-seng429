import type { SystemStatus } from "@/lib/domain";
import { MSG_UNREACHABLE } from "@/lib/api/types";
import { adviceFor, needsRestartHint, systemLine, systemSentence, systemSummary } from "./system-words";

const at = "2026-11-19T11:32:00.000Z";

function status(codes: Array<[string, string]>): SystemStatus {
  const problems = codes.map(([code, message]) => ({ code, message }));
  const has = (...c: string[]) => problems.some((p) => c.includes(p.code));
  return {
    reading: !has("ingest_down", "ingest_stale"),
    message: problems[0]?.message ?? null,
    checked_at: at,
    ingest: { ok: !has("ingest_down", "ingest_stale"), last_poll_at: at, age_s: 20 },
    agents: { ok: !has("agents_down"), last_run_at: at, age_s: 300 },
    scheduler: { ok: !has("scheduler_down") },
    backup: { ok: !has("backup_never", "backup_stale"), last_at: at, age_h: 8.5 },
    problems,
  };
}

const NOT_READING: [string, string] = ["ingest_down", "KAPtan şu an bildirim okumuyor."];
const NO_BACKUP: [string, string] = ["backup_never", "Henüz yedek alınmadı."];
const WARMING: [string, string] = ["warming_up", "KAPtan ilk hazırlığını yapıyor. Bu 15-25 dakika sürebilir."];

describe("the shell's system line", () => {
  it("says nothing while everything works, and nothing before the first answer", () => {
    expect(systemLine(status([]), false)).toBeNull();
    expect(systemLine(null, false)).toBeNull();
  });

  it("shows the most important problem with what the person can do", () => {
    const line = systemLine(status([NOT_READING, NO_BACKUP]), false);
    expect(line?.message).toBe("KAPtan şu an bildirim okumuyor.");
    expect(line?.advice).toBe("Birkaç dakika içinde düzelmezse KAPtan’ı kapatıp yeniden aç.");
  });

  it("says the person need do nothing when that is the truth", () => {
    expect(systemLine(status([WARMING]), false)?.advice).toMatch(/Senin bir şey yapman gerekmiyor\.$/);
    expect(systemLine(status([NO_BACKUP]), false)?.advice).toMatch(/kendiliğinden alınır/);
  });

  it("has advice for a problem it has never heard of", () => {
    expect(adviceFor("something_new")).toMatch(/yeniden aç\.$/);
  });

  it("says KAPtan cannot be reached when the API stops answering, whatever it said last", () => {
    const line = systemLine(status([]), true);
    expect(line?.message).toBe(MSG_UNREACHABLE);
    expect(line?.advice).toMatch(/baslat\.cmd/);
  });

  it("never blames the person", () => {
    const codes = ["ingest_down", "ingest_stale", "warming_up", "agents_down", "scheduler_down", "backup_never", "backup_stale", "x"];
    for (const c of codes) expect(adviceFor(c)).not.toMatch(/yaptın|kapattın|unuttun|hatan/i);
  });
});

describe("Ayarlar · Sistem in words", () => {
  it("opens with the answer", () => {
    expect(systemSentence(null, false)).toBe("KAPtan’a bakıyorum…");
    expect(systemSentence(status([]), false)).toBe("KAPtan çalışıyor.");
    expect(systemSentence(status([NOT_READING]), false)).toBe("KAPtan’ın bir işi aksıyor.");
    expect(systemSentence(status([NOT_READING, ["agents_down", "x"], NO_BACKUP]), false)).toBe("KAPtan’ın 2 işi aksıyor.");
    expect(systemSentence(status([]), true)).toBe("KAPtan’a ulaşılamıyor.");
  });

  it("does not call a first-day preparation or a missing backup a fault", () => {
    expect(systemSentence(status([WARMING, NO_BACKUP]), false)).toBe("KAPtan çalışıyor.");
  });

  it("says in one sentence that all is well, with the time it last looked", () => {
    expect(systemSummary(status([]))).toBe("Duyuruları okuyor, değerlendiriyor ve gece yedeğini alıyor. Son bakış 14:32.");
  });

  it("only explains how to restart when some advice asks for it", () => {
    expect(needsRestartHint(status([NOT_READING]))).toBe(true);
    expect(needsRestartHint(status([WARMING, NO_BACKUP]))).toBe(false);
  });
});
