/**
 * One plain line for the finance words a person cannot avoid. Keep it short: if a word needs two
 * lines here, the screen should not be using it. Add words sparingly; `Term` reads from this list.
 */
export const DICTIONARY = {
  bildirim: "Şirketlerin borsaya yaptığı resmî açıklama. Herkes aynı anda görür.",
  KAP: "Kamuyu Aydınlatma Platformu: Türkiye'de şirketlerin açıklamalarını yayımladığı resmî site.",
  hisse: "Bir şirketin küçük bir parçası. Alınca o şirkete ortak olursun.",
  "geri alım": "Şirketin kendi hissesini borsadan parasıyla satın alması.",
  "aracı kurum": "Borsada al-sat yapmanı sağlayan şirket. Çoğu bankanın uygulaması da bu işi görür.",
  nakit: "Hiçbir hisseye bağlı olmayan, hemen kullanabileceğin paran.",
  adet: "Kaç tane hisse aldığın ya da sattığın.",
  piyasa: "Borsadaki hisselerin genel gidişi. Karşılaştırma için kullanılır.",
} as const;

export type DictionaryWord = keyof typeof DICTIONARY;
