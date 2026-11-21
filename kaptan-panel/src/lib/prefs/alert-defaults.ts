import type { AlertPrefs, AlertTopic } from "@/lib/domain";

/** Every kind on for the phone and this computer, no quiet hours: what a new install starts with (mirrors the backend). */
export function defaultAlertPrefs(): AlertPrefs {
  const on = { phone: true, desktop: true };
  return {
    kinds: {
      suggestion: { ...on },
      part_down: { ...on },
      watched: { ...on },
      price: { ...on },
      weekly: { ...on },
    },
    quiet: { on: false, start: "22:00", end: "08:00" },
    muted: [],
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
  part_down: {
    name: "Sistem sorunu",
    when: "KAPtan’ın bir parçası 15 dakikadan uzun çalışmadığında.",
  },
  watched: {
    name: "İzlediğin şirket",
    when: "İzlediğin bir şirket yeni bir bildirim yaptığında.",
  },
  price: {
    name: "Fiyat uyarısı",
    when: "Kendi kurduğun bir fiyat uyarısı tetiklendiğinde. Telefona hisse adı gitmez.",
  },
  weekly: {
    name: "Haftalık özet",
    when: "Her cuma, haftalık özetin hazır olduğunda.",
  },
};
