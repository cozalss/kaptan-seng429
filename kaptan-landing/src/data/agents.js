// The eight agents shown in the pinned "Bölüm 2 · Tayfa" strip and the agent modal, in pipeline
// order: six LLM agents read and collect evidence, two deterministic stages decide. Facts only
// (KAPTAN-BRIEF.md §0) — no invented metrics. `image` is the base of the generated `ajan-N` set.

// Sentence case (never tracked caps): the card folio reads "4 / 8 · LLM ajanı".
export const AGENT_KIND = Object.freeze({ llm: 'LLM ajanı', rule: 'Deterministik' });

const AGENT_LIST = [
  {
    id: 'siniflandirici',
    kind: 'llm',
    name: 'Sınıflandırıcı',
    meta: 'Girdi: bildirim · Çıktı: E1–E4 / filtre / diğer',
    description:
      'Her bildirimin türünü bulur: pay geri alımı, yönetici ya da ana ortak alımı, yeni iş ilişkisi, finansal sonuç — ya da hiçbiri. 200 kilitli test bildirimiyle ölçülür; hedef macro-F1 ≥ 0,85.',
    notDoes: 'Al ya da sat demez; yalnızca etiketler.',
  },
  {
    id: 'okuyucu',
    kind: 'llm',
    name: 'Okuyucu',
    meta: 'Girdi: bildirim metni · Çıktı: tutar, karşı taraf, süre',
    description:
      'Sınıflandırılan bildirimin serbest metnini yapılandırılmış alanlara çevirir: tutar, karşı taraf, süre. Kural motorunun ihtiyaç duyduğu her değer buradan gelir.',
    notDoes: 'Oran hesaplamaz; hesabı birleştirme düğümü yapar.',
  },
  {
    id: 'onemlilik',
    kind: 'llm',
    name: 'Önemlilik',
    meta: 'Girdi: şirket · Çıktı: finansallar, piyasa değeri',
    description:
      'Bildirimdeki tutarın şirket için ne kadar büyük olduğunu tartmak üzere şirketin finansallarını ve piyasa değerini getirir. Oranları birleştirme düğümü hesaplar; örneğin E3’te yıllıklandırılmış tutarın yıllık gelire oranı.',
    notDoes: 'Eşiğe kendisi karar vermez.',
  },
  {
    id: 'kanit',
    kind: 'llm',
    name: 'Kanıt',
    meta: 'Girdi: olay · Çıktı: benzer geçmiş olaylar',
    description:
      'Olay hafızasından benzer geçmiş olayları seçer — o olayların sonraki getirilerini görmeden. Seçilen olayların istatistiğini kod hesaplar; seçim, sonuca bakılarak yapılamaz.',
    notDoes: 'Getiri görmez, istatistik hesaplamaz.',
  },
  {
    id: 'supheci',
    kind: 'llm',
    name: 'Şüpheci',
    meta: 'Girdi: taslak öneri · Çıktı: küçült / veto',
    description:
      'Önerideki açıkları arar: bildirimden önce fiyata yansımış bir sızıntı, abartılı bir dil. Bir açık bulduğunda önerinin büyüklüğünü küçültür ya da öneriyi veto eder.',
    notDoes: 'Bir öneriyi büyütemez.',
  },
  {
    id: 'uyum',
    kind: 'llm',
    name: 'Uyum',
    meta: 'Girdi: bildirim, şirket · Çıktı: tedbir ve injection bayrağı',
    description:
      'SPK tedbirlerini denetler ve bildirim metnine gizlenmiş talimatları (prompt-injection) yakalar. Ölçüt açık: kötü niyetli bir bildirimden çıkan emir sayısı 0.',
    notDoes: 'Kural esnetmez; şüphede öneriyi durdurur.',
  },
  {
    id: 'kural-motoru',
    kind: 'rule',
    name: 'Kural Motoru',
    meta: 'Girdi: yapılandırılmış kanıt · Çıktı: E1–E4 kararı',
    description:
      'E1–E4 kurallarını yazılı eşiklerle uygular; örneğin E1 için 10 seansta sermayenin en az %0,25’i. Aynı girdi her zaman aynı kararı verir.',
    notDoes: 'Yorum yapmaz, LLM çağırmaz.',
  },
  {
    id: 'risk-kapisi',
    kind: 'rule',
    name: 'Risk Kapısı',
    meta: 'Girdi: öneri · Çıktı: aynen / küçült / reddet',
    description:
      '16 kuraldan (R01–R16) geçirir: işlem başına %0,5 risk, pozisyon en fazla %10; günlük −%1’de yeni emir durur, zirveden −%5’te kill switch açık emirleri iptal eder.',
    notDoes: 'Bir öneriyi asla büyütmez; pozisyon satmaz.',
  },
];

/** "LLM ajanı · 01" / "Deterministik · 07" — the agent's kind and place in the pipeline. */
export function agentCategory(kind, index) {
  const label = AGENT_KIND[kind];
  if (!label) throw new RangeError(`agentCategory: unknown kind "${kind}"`);
  if (!Number.isInteger(index) || index < 0) throw new RangeError('agentCategory: index must be an integer ≥ 0');
  return `${label} · ${String(index + 1).padStart(2, '0')}`;
}

export const AGENTS = Object.freeze(
  AGENT_LIST.map((agent, index) =>
    Object.freeze({
      ...agent,
      number: String(index + 1).padStart(2, '0'),
      kindLabel: AGENT_KIND[agent.kind],
      category: agentCategory(agent.kind, index),
      image: `/images/ajan-${index + 1}.jpg`,
    }),
  ),
);

/** @returns {typeof AGENTS[number] | null} */
export function findAgent(id, agents = AGENTS) {
  return agents.find((agent) => agent.id === id) ?? null;
}
