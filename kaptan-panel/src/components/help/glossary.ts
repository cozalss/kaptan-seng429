/**
 * Every finance word that appears in the app, with one plain line each. The ids are the anchors of
 * /yardim#sozluk-<id>: `<WhatIs term="komisyon" />` links to one. Keep each line short, in the second person, and
 * free of the words the app does not use (see the word list in the brief).
 */
export interface GlossaryEntry {
  id: string;
  term: string;
  text: string;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: "adet",
    term: "Adet",
    text: "Kaç tane hisse aldığın ya da sattığın. 10 adet, o şirketin 10 küçük parçası demektir.",
  },
  {
    id: "al-sat-tut",
    term: "Al, Sat, Tut",
    text: "Al: o hisseyi satın almayı düşün. Sat: elindekini satmayı düşün. Tut: elindekine dokunma.",
  },
  {
    id: "baslangic-para",
    term: "Başlangıç paran",
    text: "KAPtan’a ilk girdiğin para. Kâr ve zarar bu paraya göre hesaplanır.",
  },
  {
    id: "bedelli",
    term: "Bedelli",
    text: "Şirket yeni hisse çıkarır ve eski ortaklara para karşılığı alma hakkı verir. Parayı verirsen hisse alırsın, vermezsen payın sulanır.",
  },
  {
    id: "bedelsiz",
    term: "Bedelsiz",
    text: "Şirket ortaklarına para almadan yeni hisse verir. Adedin artar, ama hisse başına fiyat aynı oranda düşer; paran aynı kalır.",
  },
  {
    id: "bildirim",
    term: "Bildirim",
    text: "Bir şirketin KAP’ta yaptığı resmî duyuru: yeni bir sözleşme, bir sonuç, bir hisse geri alımı gibi.",
  },
  {
    id: "borsa-gunu",
    term: "Borsa günü",
    text: "Borsanın açık olduğu gün. Hafta sonu ve resmî tatiller sayılmaz.",
  },
  {
    id: "en-fazla-fiyat",
    term: "“En fazla X ₺’den”",
    text: "Almak için ödemeyi kabul ettiğin en yüksek fiyat. Bankanda bu fiyatı geçmeden almanı söylersin.",
  },
  {
    id: "geri-alim",
    term: "Geri alım",
    text: "Şirketin kendi hissesini piyasadan satın alması. Geçmişte bu çoğu zaman fiyatı destekledi; garanti değildir.",
  },
  {
    id: "guven",
    term: "Güven",
    text: "KAPtan’ın bir öneriye ne kadar güvendiği. Yüksek olması kazanacağın anlamına gelmez; yalnızca kanıtın daha güçlü olduğunu söyler.",
  },
  {
    id: "izleme-listesi",
    term: "İzleme listesi",
    text: "Haber almak istediğin şirketlerin listesi. Bunlar bildirim yapınca sana söylenir. KAPtan bu şirketleri, normalde baktığı hisse listesinin dışında olsalar bile inceler; işlem hacmi düşükse tutarı küçük tutar ve öneri kartında bunu açıkça yazar.",
  },
  {
    id: "kap",
    term: "KAP",
    text: "Kamuyu Aydınlatma Platformu: borsadaki şirketlerin resmî duyurularını yaptığı herkese açık site.",
  },
  {
    id: "kar-zarar",
    term: "Kâr ve zarar",
    text: "Başladığından beri paranın ne kadar arttığı ya da azaldığı. Eklediğin ya da çektiğin para kâr ya da zarar sayılmaz.",
  },
  {
    id: "komisyon",
    term: "Komisyon",
    text: "Her alım ve satımda bankanın ya da aracı kurumun aldığı ücret. Kâr ve zarar hesabına dahildir.",
  },
  {
    id: "kota",
    term: "Kota",
    text: "Ücretsiz yapay zekâ hizmetlerinin günlük kullanım hakkı. Dolarsa KAPtan bildirimleri sonra okumak üzere bekletir.",
  },
  {
    id: "maliyet",
    term: "Maliyet",
    text: "Bir hisseyi ortalama kaç ₺’den aldığın. Fiyat maliyetin üstündeyse kârdasın.",
  },
  {
    id: "nakit",
    term: "Nakit",
    text: "Hisseye çevrilmemiş, hesabında bekleyen para.",
  },
  {
    id: "oneri",
    term: "Öneri",
    text: "KAPtan’ın bir bildirimi okuyup “şunu al” ya da “şunu sat” demesi. Bir emir değildir: yapıp yapmamak senin kararın.",
  },
  {
    id: "param",
    term: "Param",
    text: "Nakdin ile hisselerinin bugünkü değerinin toplamı.",
  },
  {
    id: "referans",
    term: "BIST 100",
    text: "Borsa İstanbul’daki en büyük 100 şirketin ortalama gidişi. Paranın borsadan iyi mi kötü mü gittiğini ölçmek için kullanılır.",
  },
  {
    id: "sessiz-saatler",
    term: "Sessiz saatler",
    text: "Telefonuna ve e-postana bildirim göndermediğimiz saatler. Beklettiklerimiz bitince gelir; her şeyin durması hemen gelir.",
  },
  {
    id: "tatil-modu",
    term: "Tatil modu",
    text: "KAPtan bildirimleri okumaya ve saklamaya devam eder, ama sen dönene kadar öneri çıkarmaz.",
  },
  {
    id: "tedbir",
    term: "Tedbirli hisse",
    text: "Borsanın, fiyat oynaklığı yüzünden işlem kısıtı koyduğu hisse. KAPtan bunlar için öneri çıkarmaz.",
  },
  {
    id: "temettu",
    term: "Temettü",
    text: "Şirketin kârından hissedarlarına dağıttığı para. Eline geçen temettü senin için gerçek bir kazançtır.",
  },
  {
    id: "yasak-liste",
    term: "Yasak liste",
    text: "Senin “bunu hiç önerme” dediğin hisseler. KAPtan onlar için öneri çıkarmaz.",
  },
  {
    id: "yedek",
    term: "Yedek",
    text: "Kayıtlarının bilgisayarının dışında bir klasöre kopyası. Bilgisayar bozulursa kayıtlarını buradan geri alırsın.",
  },
  {
    id: "zirve",
    term: "Zirve",
    text: "Paranın o ana kadar çıktığı en yüksek değer. Paranın zirveden ne kadar düştüğü bu değerden hesaplanır.",
  },
];

/** Alphabetical in Turkish (ç, ğ, ı, ö, ş, ü in their places). */
export function sortedGlossary(): readonly GlossaryEntry[] {
  return [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, "tr"));
}

export const glossaryAnchor = (id: string) => `sozluk-${id}`;

/** Entries whose word or explanation contains the search (Turkish-aware, case-insensitive). */
export function searchGlossary(query: string): readonly GlossaryEntry[] {
  const needle = query.trim().toLocaleLowerCase("tr-TR");
  const all = sortedGlossary();
  if (!needle) return all;
  return all.filter((e) =>
    `${e.term} ${e.text}`.toLocaleLowerCase("tr-TR").includes(needle),
  );
}
