// The "Altı adımda" drawer: one disclosure's way through KAPtan, step by step (static copy),
// drawn as a six-panel storyboard. `art` names the panel's ink drawing (src/ui/storyboard-art.js).
// Facts only (KAPTAN-BRIEF.md §0).

export const SIX_STEPS = Object.freeze(
  [
    {
      title: 'Bildirim gelir',
      art: 'arrive',
      text: 'KAP’ta yeni bir bildirim yayımlanır. Yapay zekâdan önce ön eleme çalışır: pay işlem görüyor mu, tedbir var mı, şirket listede mi?',
    },
    {
      title: 'Sınıflandır ve oku',
      art: 'read',
      text: 'Sınıflandırıcı türü bulur (E1–E4, filtre, diğer); Okuyucu tutarı, karşı tarafı ve süreyi çıkarır.',
    },
    {
      title: 'Önemi ve kanıtı tart',
      art: 'weigh',
      text: 'Önemlilik finansal rakamları ve piyasa değerini getirir; Kanıt benzer geçmiş olayları getirilerini görmeden seçer, istatistiği kod hesaplar.',
    },
    {
      title: 'Açıkları ara',
      art: 'doubt',
      text: 'Şüpheci sızıntı ve abartı arar, gerekirse küçültür ya da veto eder; Uyum SPK tedbirlerine ve metne gizlenmiş talimatlara bakar.',
    },
    {
      title: 'Kurallar karar verir',
      art: 'rules',
      text: 'Kural motoru E1–E4 kurallarını uygular; risk kapısı 16 kuralla (R01–R16) yalnızca küçültür ya da reddeder.',
    },
    {
      title: 'Sen onaylarsın',
      art: 'approve',
      text: 'Gerekçeli öneri senin önüne gelir. Otomatik işlem yok: onaylarsan işlemi kendi bankandan ya da aracı kurumundan girersin; onaylamazsan öneri bir sonraki borsa gününün 09:50’sinde düşer. Her adım Geçmiş’e yazılır.',
    },
  ].map((step, index) => Object.freeze({ ...step, number: String(index + 1).padStart(2, '0') })),
);
