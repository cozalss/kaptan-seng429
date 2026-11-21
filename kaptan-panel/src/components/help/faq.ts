/** The questions people ask first, with plain answers. Every claim here is what KAPtan really does. */
export interface Faq {
  id: string;
  question: string;
  answer: readonly string[];
}

export const FAQ: readonly Faq[] = [
  {
    id: "oneri-nedir",
    question: "Öneri nedir?",
    answer: [
      "KAPtan şirketlerin resmî duyurularını okur. Birinin işine yarayabileceğini düşünürse sana bir öneri hazırlar: ne yapmayı, neden ve ne kadarla önerdiğini söyler.",
      "Öneri bir emir değildir. Yapmak da yapmamak da senin kararın; geçersen hiçbir şey olmaz.",
    ],
  },
  {
    id: "onaylayinca",
    question: "Onaylarsam ne olur?",
    answer: [
      "KAPtan hiçbir zaman kendi başına alıp satmaz. Onayladığında sana bir işlem notu hazırlar: hangi hisse, kaç adet, en fazla hangi fiyattan.",
      "Bu işlemi bankandan ya da aracı kurumundan sen girersin. Sonra gerçekleşen fiyatı ve adedi KAPtan’a yazarsın; paran ve hisselerin ancak o zaman güncellenir.",
    ],
  },
  {
    id: "param-nerede",
    question: "Param nerede?",
    answer: [
      "Paran kendi bankanda ya da aracı kurumundadır. KAPtan para tutmaz ve para taşımaz; hesabına da erişemez.",
      "KAPtan yalnızca senin yazdıklarını izler: başlangıç paran, eklediğin ya da çektiğin para, aldığın ve sattığın hisseler. Gerçekle uyuşması için gerçekleşen işlemleri yazman gerekir.",
    ],
  },
  {
    id: "durdurmalar",
    question: "Durdurma sınırları ne işe yarar?",
    answer: [
      "Günlük sınır: paran bir günde %1’den fazla düşerse o gün yeni öneri çıkmaz. Ertesi gün kendiliğinden kalkar.",
      "Büyük sınır: paran zirvesinden %5 düşerse KAPtan her şeyi durdurur. Elindeki hisseleri satmaz; yalnızca yeni öneri çıkarmaz. Yeniden başlatmak için en az 24 saat ve 5 borsa günü beklenir.",
      "İstediğin an “Durdur”a basarak da her şeyi durdurabilirsin. Bu sınırları yalnızca sıkılaştırabilirsin.",
    ],
  },
  {
    id: "tutar",
    question: "Ne kadar tutar?",
    answer: [
      "KAPtan ücretsiz hizmetlerle çalışır. Ücretli bir yedek yapay zekâ hizmeti kullanırsa günlük bir üst sınırı vardır ve onu aşamaz.",
      "Ücretsiz kotalar dolarsa KAPtan bildirimleri sonra okumak üzere bekletir; bunu sana açıkça söyler.",
    ],
  },
  {
    id: "bilgisayar-kapaliysa",
    question: "Bilgisayar kapalıysa ne olur?",
    answer: [
      "KAPtan senin bilgisayarında çalışır. Kapalıyken bildirim okuyamaz ve sana haber veremez.",
      "Bilgisayarı açınca eksik kalan piyasa verilerini tamamlamaya çalışır. İşlem zamanı çoktan geçmiş bildirimler için öneri çıkarmaz.",
    ],
  },
  {
    id: "yedek-nasil",
    question: "Yedeği nasıl alırım?",
    answer: [
      "KAPtan her gün kendiliğinden yedek alır. Ayarlar’daki “Yedek” bölümünde son yedeğin ne zaman alındığını görür, istersen “Şimdi yedek al”a basarsın.",
      "Yedekler kurulumda seçtiğin klasöre gider. O klasörü ara sıra başka bir diske ya da buluta kopyalamak iyi olur.",
    ],
  },
  {
    id: "tatil",
    question: "Bir süre öneri istemiyorum. Ne yapayım?",
    answer: [
      "Ayarlar’daki “Tatil modu”nu aç. KAPtan bildirimleri okumaya ve saklamaya devam eder, ama dönene kadar öneri çıkarmaz ve ücretsiz kotanı harcamaz.",
      "Bitiş tarihinde ya da “Şimdi devam et”e bastığında yeniden başlar. Durdurma sınırları tatildeyken de çalışır.",
    ],
  },
  {
    id: "parola",
    question: "Parolamı nasıl değiştiririm?",
    answer: [
      "Ayarlar’daki “Hesabın” bölümünde şimdiki parolanı ve yeni parolanı yazarsın. Diğer cihazlardaki oturumlar kapanır.",
      "Parolanı unuttuysan kurulum programını yeniden çalıştırıp yeni bir parola seçersin.",
    ],
  },
];
