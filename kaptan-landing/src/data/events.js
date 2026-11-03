// "Seyir Kuralları" (#olaylar): the ship's articles. Four buy-only event types, each a numbered
// article with its written threshold and holding period, and the filters that can shrink or stop a
// proposal (the appendix). Facts only (KAPTAN-BRIEF.md §0) — no invented thresholds.
//
// index.html prints all of this as static text (it must read with JavaScript off); the markup test
// (components/menu/menu-markup.test.js) keeps the two in step. The rules bench
// (components/rules-bench) reads the numbers from here through rules-check.js.

const freezeAll = (items) => Object.freeze(items.map((item) => Object.freeze({ ...item })));

/** Holding periods as [min, max] days (a single day count is [n, n]); the bench reads only these. */
export const EVENT_HOLDS = Object.freeze({
  E1: Object.freeze([20, 40]),
  E2: Object.freeze([20, 60]),
  E3: Object.freeze([5, 5]),
  E4: Object.freeze([5, 10]),
});

/**
 * { id, code, numeral, name, condition, holding, hold, trigger }
 * `holding` is the printed holding period, `hold` the same as [min, max] days (a single day count
 * is [n, n]). `trigger` explains a threshold-free article (E2, E4); null where a number decides.
 */
export const EVENT_ARTICLES = /* @__PURE__ */ freezeAll([
  {
    id: 'e1',
    code: 'E1',
    numeral: 'I',
    name: 'Pay geri alım',
    condition: 'Şirket, 10 borsa günü içinde sermayesinin en az %0,25’i kadar kendi payını geri alırsa.',
    holding: '20–40 gün',
    hold: EVENT_HOLDS.E1,
    trigger: null,
  },
  {
    id: 'e2',
    code: 'E2',
    numeral: 'II',
    name: 'Yönetici ya da ana ortak alımı',
    condition: 'Bir yönetici ya da ana ortak, şirketin payını aldığını bildirirse.',
    holding: '20–60 gün',
    hold: EVENT_HOLDS.E2,
    trigger: 'Sayısal eşik yok: bildirimin kendisi yeter. Büyüklüğünü sonraki adımlar tartar.',
  },
  {
    id: 'e3',
    code: 'E3',
    numeral: 'III',
    name: 'Yeni iş ilişkisi ya da ihale',
    condition: 'İşin bir yıla düşen tutarı, şirketin yıllık gelirinin en az %10’una ulaşırsa.',
    holding: '5 gün',
    hold: EVENT_HOLDS.E3,
    trigger: null,
  },
  {
    id: 'e4',
    code: 'E4',
    numeral: 'IV',
    name: 'Finansal sonuç',
    condition: 'Şirket finansal sonuçlarını bildirdiğinde.',
    holding: '5–10 gün',
    hold: EVENT_HOLDS.E4,
    trigger: 'Sayısal eşik yok: bildirimin kendisi yeter. Büyüklüğünü sonraki adımlar tartar.',
  },
]);

/** The appendix: { id, name, condition, effect, code? } — every filter only removes or shrinks. */
export const EVENT_FILTERS = /* @__PURE__ */ freezeAll([
  { id: 'on-eleme', name: 'Ön eleme', condition: 'Yapay zekâdan önce: işlem görebilirlik, tedbir, izlenen liste.', effect: 'Uymayan bildirim elenir.' },
  { id: 'sizinti', name: 'Sızıntı filtresi', condition: 'Son 5 borsa gününde > %8 yükseliş.', effect: 'Öneri atlanır ya da yarıya indirilir.' },
  {
    id: 'risk-kapisi',
    name: 'Risk kapısı',
    code: 'R01–R16',
    condition: '16 kural.',
    effect: 'Bir öneriyi yalnızca küçültür ya da reddeder.',
  },
  { id: 'islem-riski', name: 'İşlem başına risk', condition: 'Paranın %0,5’i risk; tek payda ≤ %10.', effect: 'Büyüklük sınırlanır.' },
  { id: 'gunluk-kayip', name: 'Günlük kayıp', condition: 'Gün içinde −%1.', effect: 'Yeni emir durur.' },
  { id: 'kill-switch', name: 'Acil durdurma', condition: 'Zirveden −%5.', effect: 'Bekleyen emirler iptal edilir; elindeki paylar satılmaz.' },
]);

/** Ön eleme's three gates, in the order the brief names them. `key` is the screenGates() input. */
export const SCREEN_GATES = freezeAll([
  { key: 'tradable', label: 'İşlem görebilirlik' },
  { key: 'noMeasure', label: 'Tedbir yok' },
  { key: 'inUniverse', label: 'Listede' },
]);

/** The leak filter as numbers: a rise of more than `risePct` over the last `sessions` sessions. */
export const LEAK_FILTER = Object.freeze({ sessions: 5, risePct: 8 });

/** Shared copy of the bench: said under every instrument, and the one fictional issuer it uses. */
export const BENCH_COPY = Object.freeze({
  result: 'Öneri adayı → filtreler → senin onayın. Otomatik işlem yok.',
  issuer: 'ÖRNEK ENERJİ A.Ş.',
  leakEffect: 'Öneri atlanır ya da yarıya indirilir.',
});

/** Shared day scale of the tide rulers (every holding period is drawn on the same 0–60 gün). */
export const HOLD_SCALE_DAYS = 60;
