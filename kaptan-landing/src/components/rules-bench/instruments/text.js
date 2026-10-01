// Pure Turkish copy for the rule instruments (no DOM). Every sentence the bench prints or announces
// is built here so it can be tested: numbers in tr-TR ("%0,25"), the right possessive suffix
// ("%0,19'u", "%12'si") and never the words "al", "kazandırır" or "garanti".

export const ISSUER = 'ÖRNEK ENERJİ A.Ş.';
export const RESULT_LINE = 'Öneri adayı → filtreler → insan onayı. Otomatik emir yok.';
export const LEAK_EFFECT = 'atlanır ya da yarıya indirilir';

const MINUS = '−';

/** 0.3 → "0,30" with `digits` fixed decimals, or up to `digits` decimals when `trim` is set. */
export function formatNumber(value, digits = 2, trim = false) {
  const abs = Math.abs(value);
  const text = abs.toFixed(digits).replace('.', ',');
  const out = trim && text.includes(',') ? text.replace(/0+$/, '').replace(/,$/, '') : text;
  return value < 0 && Number(abs.toFixed(digits)) !== 0 ? MINUS + out : out;
}

/** "%0,25" / "−%2,5" (Turkish sets the percent sign first). */
export function formatPct(value, digits = 2, trim = false) {
  const text = formatNumber(value, digits, trim);
  return text.startsWith(MINUS) ? `${MINUS}%${text.slice(1)}` : `%${text}`;
}

const ONES = ['', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'];
const TENS = ['', 'u', 'si', 'u', 'ı', 'si', 'ı', 'i', 'i', 'ı'];

/** Possessive suffix after a number as it is read aloud ("otuz bir" → i, "on dokuz" → u). */
export function possessiveSuffix(numberText) {
  const [whole, frac = ''] = numberText.replace(MINUS, '').split(',');
  const spoken = frac && Number(frac) !== 0 ? Number(frac) : Number(whole);
  if (!spoken) return 'ı'; // sıfır
  if (spoken % 10) return ONES[spoken % 10];
  if (Math.floor(spoken / 10) % 10) return TENS[Math.floor(spoken / 10) % 10];
  return spoken % 1000 ? 'ü' : 'i'; // yüz / bin
}

/** "%0,19'u", "%12'si". */
export function pctWithSuffix(value, digits = 2, trim = false) {
  const text = formatPct(value, digits, trim);
  return `${text}'${possessiveSuffix(formatNumber(value, digits, trim))}`;
}

const E1_PCT = (v) => pctWithSuffix(v, 2);
const WHOLE_PCT = (v) => formatPct(v, 1, true);

/** Sentences per rule: `state` is the live/visible sentence, `valuetext` the slider's aria-valuetext. */
export const COPY = {
  E1: {
    valuetext: (v, fired) => `sermayenin ${E1_PCT(v)}, ${fired ? 'eşiğe ulaşıyor' : 'eşiğin altında'}`,
    state: (v, fired) =>
      fired
        ? `E1 tutar: 10 seansta geri alım sermayenin ${E1_PCT(v)}, eşik %0,25. Öneri adayı doğar.`
        : `E1 tutmaz: 10 seansta geri alım sermayenin ${E1_PCT(v)}, eşik %0,25. Öneri yok.`,
  },
  E3: {
    valuetext: (v, fired) =>
      `yıllık gelirin ${pctWithSuffix(v, 1, true)}, ${fired ? 'eşiğe ulaşıyor' : 'eşiğin altında'}`,
    state: (v, fired) =>
      fired
        ? `E3 tutar: yıllıklandırılmış tutar yıllık gelirin ${pctWithSuffix(v, 1, true)}, eşik %10. Öneri adayı doğar.`
        : `E3 tutmaz: yıllıklandırılmış tutar yıllık gelirin ${pctWithSuffix(v, 1, true)}, eşik %10. Öneri yok.`,
  },
  E2: {
    state: (on) =>
      on
        ? 'E2 tutar: yönetici ya da ana ortak alımı bildirildi. Öneri adayı doğar; büyüklüğünü sonraki adımlar tartar.'
        : 'E2 tutmaz: alım bildirimi yok. Öneri yok.',
  },
  E4: {
    state: (on) =>
      on
        ? 'E4 tutar: finansal sonuç açıklandı. Öneri adayı doğar; büyüklüğünü sonraki adımlar tartar.'
        : 'E4 tutmaz: finansal sonuç açıklanmadı. Öneri yok.',
  },
  leak: {
    valuetext: (v, fired) => `son 5 seansta yükseliş ${WHOLE_PCT(v)}, ${fired ? 'eşiği aşıyor' : 'eşiği aşmıyor'}`,
    state: (v, fired) =>
      fired
        ? `Sızıntı filtresi devrede: son 5 seansta yükseliş ${WHOLE_PCT(v)}, eşik %8. Öneri ${LEAK_EFFECT}.`
        : `Sızıntı filtresi geçer: son 5 seansta yükseliş ${WHOLE_PCT(v)}, eşik %8. Öneri küçülmez.`,
  },
};

/** Short visible verdicts [not fired, fired]; the full sentence goes to the live region / onChange. */
export const SHORT = {
  E1: ['E1 tutmaz: öneri yok.', 'E1 tutar: öneri adayı doğar.'],
  E2: ['E2 tutmaz: bildirim yok.', 'E2 tutar: öneri adayı doğar.'],
  E3: ['E3 tutmaz: öneri yok.', 'E3 tutar: öneri adayı doğar.'],
  E4: ['E4 tutmaz: açıklama yok.', 'E4 tutar: öneri adayı doğar.'],
  leak: ['Filtre geçer: öneri küçülmez.', `Sızıntı: öneri ${LEAK_EFFECT}.`],
};

export const GATES = [
  { key: 'tradable', name: 'İşlem görebilirlik', on: 'İşlem görebilir', off: 'İşlem göremez' },
  { key: 'noMeasure', name: 'Tedbir', on: 'Tedbir yok', off: 'Tedbir var' },
  { key: 'inUniverse', name: 'Evren', on: 'Evrende', off: 'Evren dışında' },
];

/** Joins Turkish list items: "a", "a ve b", "a, b ve c". */
export function joinTr(items) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`;
}

/** Short visible screen verdict. */
export function screenShort(failed) {
  if (!failed.length) return 'Üç kapı açık: bildirim ajanlara ulaşır.';
  const names = failed.map((key) => (GATES.find((g) => g.key === key) || { name: key }).name.toLocaleLowerCase('tr-TR'));
  const text = `${joinTr(names)} ${names.length > 1 ? 'kapıları' : 'kapısı'} kapalı: bildirim elenir.`;
  return text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1);
}

/** Screen sentence from the list of failed gate keys. */
export function screenSentence(failed) {
  if (!failed.length) return 'Ön eleme geçer: üç kapı da açık, bildirim ajanlara ulaşır.';
  const names = failed.map((key) =>
    (GATES.find((g) => g.key === key) || { name: key }).name.toLocaleLowerCase('tr-TR'),
  );
  const noun = names.length > 1 ? 'kapıları' : 'kapısı';
  return `Ön eleme: ${joinTr(names)} ${noun} kapalı. Bildirim yapay zekâya ulaşmadan elenir.`;
}
