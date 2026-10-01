// The "Demo" drawer: the live demo, step by step, as it will run at the final (static copy),
// drawn as a six-panel storyboard. `art` names the panel's ink drawing (src/ui/storyboard-art.js).
// Facts only (KAPTAN-BRIEF.md §0).

export const DEMO_FINAL = Object.freeze({ label: 'Final sunumu', date: '2027-01' });

export const DEMO_STEPS = Object.freeze(
  [
    {
      title: 'Bildirim gelir',
      art: 'arrive',
      text: 'KAP’ta yeni bir bildirim yayımlanır. LLM’den önce ön eleme çalışır: işlem görebilirlik, tedbir, evren.',
    },
    {
      title: 'Sınıflandır ve oku',
      art: 'read',
      text: 'Sınıflandırıcı türü bulur (E1–E4, filtre, diğer); Okuyucu tutarı, karşı tarafı ve süreyi çıkarır.',
    },
    {
      title: 'Önemi ve kanıtı tart',
      art: 'weigh',
      text: 'Önemlilik finansalları ve piyasa değerini getirir; Kanıt benzer geçmiş olayları getirilerini görmeden seçer, istatistiği kod hesaplar.',
    },
    {
      title: 'Açıkları ara',
      art: 'doubt',
      text: 'Şüpheci sızıntı ve abartı arar, gerekirse küçültür ya da veto eder; Uyum SPK tedbirlerini ve prompt-injection’ı denetler.',
    },
    {
      title: 'Kurallar karar verir',
      art: 'rules',
      text: 'Kural motoru E1–E4 kurallarını uygular; risk kapısı 16 kuralla (R01–R16) yalnızca küçültür ya da reddeder.',
    },
    {
      title: 'İnsan onaylar',
      art: 'approve',
      text: 'Gerekçeli öneri analistin önüne gelir. Otomatik emir yok: onaylanmayan öneri bir sonraki seansın 09:50’sinde düşer. Her adım denetim kaydına yazılır.',
    },
  ].map((step, index) => Object.freeze({ ...step, number: String(index + 1).padStart(2, '0') })),
);
