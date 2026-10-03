/**
 * The personal kill-switch reset clock (PERSONAL-SPEC §3.1, 12 §8/4). In the demo, Ayarlar →
 * "Zamanı ileri sar" moves only this clock forward; against a real API the offset is 0.
 */
export function resetClockMs(nowMs: number, offsetH: number): number {
  return nowMs + offsetH * 3_600_000;
}
