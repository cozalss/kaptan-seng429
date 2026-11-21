import type { AlertPrefs, AlertTopic } from "@/lib/domain";

/** Every kind on for the phone and this computer, no quiet hours: what a new install starts with (mirrors the backend). */
export function defaultAlertPrefs(): AlertPrefs {
  const on = { phone: true, desktop: true };
  return {
    kinds: {
      suggestion: { ...on },
      day_halt: { ...on },
      stopped: { ...on },
      part_down: { ...on },
      watched: { ...on },
    },
    quiet: { on: false, start: "22:00", end: "08:00" },
  };
}

/** Plain names of the five kinds, and a line saying when each one is sent. */
export const TOPIC_WORDS: Readonly<
  Record<AlertTopic, { name: string; when: string }>
> = {
  suggestion: {
    name: "Yeni öneri",
    when: "KAPtan sana bir öneri hazırladığında.",
  },
  day_halt: {
    name: "Günlük sınır",
    when: "Paran bir günde %1 düşüp yeni işlemler durduğunda.",
  },
  stopped: {
    name: "Her şey durduğunda",
    when: "KAPtan her şeyi durdurduğunda. Sessiz saatlerde de hemen gelir.",
  },
  part_down: {
    name: "Sistem sorunu",
    when: "KAPtan’ın bir parçası 15 dakikadan uzun çalışmadığında.",
  },
  watched: {
    name: "İzlediğin şirket",
    when: "İzlediğin bir şirket yeni bir bildirim yaptığında.",
  },
};
