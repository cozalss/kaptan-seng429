import type { SystemStatus } from "@/lib/domain";
import { MSG_UNREACHABLE } from "@/lib/api/types";
import { fmtInt, fmtTime } from "@/lib/format";

/**
 * The words about KAPtan's own health, as pure functions: the shell's one line and the Sistem
 * block in Ayarlar. The API says what is wrong (`problems[].message`); what the person can do
 * about it, or that they need do nothing, is said here, by the problem's code.
 */
const RESTART = "Birkaç dakika içinde düzelmezse KAPtan’ı kapatıp yeniden aç.";
const NOTHING_TO_DO = "Senin bir şey yapman gerekmiyor.";

/** The two files in KAPtan's folder that stop and start it (the installer's names). */
export const STOP_FILE = "durdur.cmd";
export const START_FILE = "baslat.cmd";
export const RESTART_HOW = `Kapatıp açmak için KAPtan klasöründeki ${STOP_FILE} dosyasını, ardından ${START_FILE} dosyasını çalıştır.`;

const ADVICE: Readonly<Record<string, string>> = {
  ingest_down: RESTART,
  ingest_stale: RESTART,
  warming_up: `Bu sırada öneri çıkmaz. ${NOTHING_TO_DO}`,
  agents_down: `Bu sürerken yeni öneri gelmez. ${RESTART}`,
  scheduler_down: `Fiyatlar eski kalabilir. ${RESTART}`,
  backup_never: "İlk yedek gece kendiliğinden alınır; o saatte bilgisayarın açık olması yeter.",
  backup_stale: "Yedek gece kendiliğinden alınır; o saatte bilgisayarın açık olması yeter.",
};

/** Not faults: KAPtan works, there is only something worth knowing. */
const NOTES: ReadonlySet<string> = new Set(["warming_up", "backup_never", "backup_stale"]);

const UNREACHABLE_ADVICE = `Kapalıysa ${START_FILE} ile aç. Açıksa birkaç saniye içinde kendiliğinden düzelir.`;

/** What the person can do about a problem, or that they need do nothing. */
export function adviceFor(code: string): string {
  return ADVICE[code] ?? RESTART;
}

export interface SystemLine {
  message: string;
  advice: string;
}

/** The shell's one line: the most important problem, or that KAPtan does not answer. Null = say nothing. */
export function systemLine(status: SystemStatus | null, unreachable: boolean): SystemLine | null {
  if (unreachable) return { message: MSG_UNREACHABLE, advice: UNREACHABLE_ADVICE };
  const first = status?.problems[0];
  const message = status?.message ?? first?.message;
  if (!message) return null;
  return { message, advice: adviceFor(first?.code ?? "") };
}

function faults(status: SystemStatus): number {
  return status.problems.filter((p) => !NOTES.has(p.code)).length;
}

/** The Sistem block's one sentence. */
export function systemSentence(status: SystemStatus | null, unreachable: boolean): string {
  if (unreachable) return "KAPtan’a ulaşılamıyor.";
  if (!status) return "KAPtan’a bakıyorum…";
  const n = faults(status);
  if (n === 0) return "KAPtan çalışıyor.";
  return n === 1 ? "KAPtan’ın bir işi aksıyor." : `KAPtan’ın ${fmtInt(n)} işi aksıyor.`;
}

/** "Son bakış 14:32." */
export function lastLook(status: SystemStatus): string {
  return `Son bakış ${fmtTime(status.checked_at)}.`;
}

/** With nothing to report: all is well, in one sentence, with the time of the last look. */
export function systemSummary(status: SystemStatus): string {
  return `Duyuruları okuyor, değerlendiriyor ve gece yedeğini alıyor. ${lastLook(status)}`;
}

/** Some advice says "kapatıp yeniden aç": then the block also says how. */
export function needsRestartHint(status: SystemStatus): boolean {
  return status.problems.some((p) => adviceFor(p.code).includes(RESTART));
}

export const UNREACHABLE_NEXT = UNREACHABLE_ADVICE;
