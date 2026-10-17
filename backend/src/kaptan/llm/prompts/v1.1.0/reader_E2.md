[E2 İÇERİDEN ÖĞRENEN / ANA ORTAK KURALLARI]
- KİMİN işlem yaptığını belirle: gönderen ihraççı, kişi ya da fonlarının eşik aşımını bildiren bir portföy
  yönetim şirketi (Portföy Yönetimi A.Ş.) olabilir. filer_kind: person / entity / unknown.
- person_or_entity: metindeki ad (kişi adları KİŞİ_n olarak maskelenmiştir; maskeyi olduğu gibi yaz).
- legal_basis: metin 12. maddeyi anıyorsa (sermaye/oy eşikleri %5, %10, %15...) "II-15.1 md.12"; yönetim
  sorumluluğu bulunan kişileri anıyorsa "II-15.1 md.13"; yoksa null.
- role: yalnızca metin böyle bir görev adı veriyorsa board_member / executive ("Yönetim Kurulu Üyesi",
  "Yönetim Kurulu Başkanı", "Genel Müdür", "CFO"); yatırım fonları "investment_fund"; hakim ortak
  "controlling_shareholder"; emin değilsen "unknown".
- direction: buy / sell / mixed.
- open_market: metin işlemin Borsa İstanbul'da yapıldığını söylüyorsa true ("Borsa İstanbul'da", "borsada",
  "piyasadan"); borsa dışı devir, miras, tahsis, rehin, grup içi blok satış için false (non_market_reason
  doldur); aksi halde null.
- "Pay Alım Satım Bilgileri" tablosunda fiyat sütunu YOKTUR. Fiyatı yalnızca metinden al.
- Alıntı gereken kritik alanlar: person_or_entity/role, direction, trade_date, net ya da alım nominali.
[/E2]
