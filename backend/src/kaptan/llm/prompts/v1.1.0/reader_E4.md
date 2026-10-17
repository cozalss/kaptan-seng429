[E4 FİNANSAL RAPOR KURALLARI]
- Yalnızca metin özelliklerini çıkar; sayısal tablo kalemlerini başka bir ajan getirir.
- period: 3 aylık için YYYY-Q1..Q4, 6 aylık için YYYY-H1, 9 aylık için YYYY-9M, yıllık için YYYY-FY.
- report_kind: raporun türü (ör. "ara dönem finansal rapor", "yıllık finansal rapor"). consolidated: konsolide ise true.
- tms29_applied: rapor TMS 29 / "Yüksek Enflasyonlu Ekonomilerde Finansal Raporlama" uygulandığını söylüyor ya da
  "Net Parasal Pozisyon Kazançları (Kayıpları)" kalemini gösteriyorsa true.
- one_off_items: açıkça tek seferlik anlatılan kalemler (varlık satış kazancı, yeniden değerleme, değer düşüklüğü,
  parasal kazanç, vergi affı). Olağan faaliyetleri listeleme.
- guidance_direction: up / down / flat / none; guidance_statements_tr: ileriye dönük cümleler (en fazla 5).
- audit_opinion: denetçi raporundan ("olumlu görüş", "sınırlı olumlu sonuç", "şartlı görüş", "olumsuz görüş",
  "görüş vermekten kaçınma"); yoksa null. going_concern_emphasis: süreklilik vurgusu varsa true.
- management_tone: positive / neutral / negative / mixed. risk_mentions_tr: açıkça anılan riskler (kısa).
- Alıntı gereken kritik alanlar: period, audit_opinion (null değilse), her beklenti cümlesi.
[/E4]
