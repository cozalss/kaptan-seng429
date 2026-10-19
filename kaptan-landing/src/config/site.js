// Project facts in one place. Every value marked PLACEHOLDER must be replaced before publishing.
// Links that are still `null` render as a muted "yakında" line — never as a dead "#".
export const SITE = Object.freeze({
  name: 'KAPtan',
  descriptor: 'BIST KAP bildirimleri için çok ajanlı yapay zekâ',
  description:
    'KAPtan, Borsa İstanbul şirketlerinin KAP bildirimlerini okuyan çok ajanlı bir yapay zekâ sistemidir: yapay zekâ kanıt toplar, deterministik kurallar karar verir, insan onaylar.',
  url: 'https://kaptan-seng429.vercel.app/',
  links: Object.freeze({
    proposalUrl: null, // PLACEHOLDER: proposal PDF (due 12 Eki 2026)
    docsUrl: 'https://github.com/cozalss/kaptan-seng429/tree/main/docs',
    githubUrl: 'https://github.com/cozalss/kaptan-seng429',
  }),
  // PLACEHOLDER names; the four roles are fixed.
  team: Object.freeze(
    [
      { name: 'Üye 1', role: 'Veri & RAG' },
      { name: 'Üye 2', role: 'Ajanlar' },
      { name: 'Üye 3', role: 'Strateji-Risk-Yürütme' },
      { name: 'Üye 4', role: 'Frontend & Değerlendirme' },
    ].map((member) => Object.freeze(member)),
  ),
});
