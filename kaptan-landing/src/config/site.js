// Project facts in one place. Every value marked PLACEHOLDER must be replaced before publishing.
// Links that are still `null` render as a muted "yakında" line — never as a dead "#".
export const SITE = Object.freeze({
  name: 'KAPtan',
  descriptor: 'BIST KAP bildirimleri için çok ajanlı yapay zekâ',
  description:
    'KAPtan, Borsa İstanbul şirketlerinin KAP bildirimlerini okuyan çok ajanlı bir yapay zekâ ders projesidir: yapay zekâ kanıt toplar, deterministik kurallar karar verir, insan onaylar. Yatırım tavsiyesi değildir.',
  url: 'https://www.example.com/', // PLACEHOLDER: production URL (structured data, og:image)
  course: Object.freeze({
    code: 'SENG 429',
    title: 'Enterprise Application Development Lab',
    university: 'Çankaya Üniversitesi',
    instructor: 'Dr. Bilgin Avenoğlu',
    term: 'Güz 2026',
    schedule: 'Pzt 13:20',
    room: 'MB06',
  }),
  links: Object.freeze({
    proposalUrl: null, // PLACEHOLDER: proposal PDF (due 12 Eki 2026)
    docsUrl: null, // PLACEHOLDER: project documentation
    githubUrl: null, // PLACEHOLDER: repository URL
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
