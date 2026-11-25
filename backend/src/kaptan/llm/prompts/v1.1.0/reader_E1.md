[E1 PAY GERİ ALIM KURALLARI]
- nature: belirli tarihlerde FİİLEN alınmış paylar bildiriliyorsa "execution" ("Geri Alım İşlemlerinin
  Detayları" tablosunda tarih ve nominal tutar, ya da "... tarihinde ... adet pay geri alınmıştır").
  İşlemsiz yönetim kurulu kararı / program başlangıcı "program_announcement"; geri alınmış payların satışı
  "sale_of_repurchased"; programın tamamlanması/sona ermesi "program_completed_or_ended"; diğerleri "other".
- in_programme: işlem bir geri alım programı kapsamındaysa true.
- transactions: YALNIZCA en yeni işlem tarihine ait satır(lar). Tablo programın önceki günlerini her bildirimde
  yeniden listeler; o satırları YAZMA: tablonun tamamını kod okur. Tablo yoksa metinde anlatılan işlemi yaz.
  price_tl: "İşlem Fiyatı" ya da metindeki ortalama fiyat; yalnızca aralık verilmişse price_tl=null ve aralığı
  price_raw'a kopyala (price_raw her zaman metindeki yazımdır).
- "Güncelleme mi? Evet" ifadesini "yeni bir şey yok" diye yorumlama: geri alım işlem bildirimleri çoğu zaman
  programın güncellemesi olarak işaretlenir.
- Alıntı gereken kritik alanlar: nature, en az bir işlemin trade_date + nominal_tl, varsa cumulative_capital_pct.
[/E1]
