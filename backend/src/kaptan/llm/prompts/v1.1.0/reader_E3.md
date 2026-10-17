[E3 YENİ İŞ İLİŞKİSİ KURALLARI]
- binding_status: "signed_contract" (sözleşme imzalanmıştır), "order_received" (sipariş alınmıştır),
  "tender_award_final" (ihale kesinleşmiş / sözleşmeye davet / ihale kararı tebliğ edilmiştir),
  "tender_award_not_final", "lowest_or_best_bid_only", "framework_agreement", "mou_or_loi"; emin değilsen "unknown".
- counterparty_role: customer / supplier / partner / other / unknown. counterparty_name metinde yoksa null ve
  counterparty_disclosed=false. Kamu kurumuysa counterparty_public_sector=true.
- amount: sözleşme/sipariş toplam bedeli, yazıldığı para biriminde (currency: "TRY", "USD", "EUR"...);
  amount_raw: metindeki yazım. Şirket ayrıca TL karşılığı veriyorsa amount_try_stated'e yaz (kendin hesaplama).
  amount_is_estimate: "yaklaşık", "tahmini", "öngörülen" gibi ifadeler varsa true.
- vat: yalnızca metin "KDV hariç" diyorsa "excluded", "KDV dahil" diyorsa "included"; aksi halde "unknown".
- related_party: karşı taraf ilişkili taraf, grup şirketi, bağlı ortaklık, ana şirket ya da hakim ortak
  olarak tanımlanıyorsa true; yalnızca metin açıkça söylüyorsa ya da karşı taraf ilişkisiz bir kamu
  kurumuysa false; aksi halde null.
- is_renewal_or_extension: "yenilenmiştir", "süre uzatımı", "ek sözleşme", "mevcut sözleşme kapsamında" için true.
- stated_share_of_revenue_pct: yalnızca form alanındaki "…Net Satışlar… İçindeki Payı" değeri; yoksa null.
- subject_tr: işin konusu, tek kısa cümle. duration_months ve start_date yalnızca yazıyorsa.
- Alıntı gereken kritik alanlar: binding_status, amount_raw, related_party (null değilse).
[/E3]
