# KAPtan işletim el kitabı (runbook)

Yerel yığın ve üretim yığını için günlük işler: başlat/durdur, Postgres yedeği ve geri yükleme, Durdur
(kill switch) sıfırlama, denetim zinciri doğrulama, anahtar döndürme. Komutlar depo kökünden çalışır.

| Yığın | Dosya | Proje adı | Açık portlar (yalnız 127.0.0.1) |
|---|---|---|---|
| Yerel (tek komut, demo günü) | `docker-compose.yml` | `kaptan-stack` | API `KAPTAN_API_PORT` (8000), panel `KAPTAN_PANEL_PORT` (3100) |
| Üretim biçimli (panel yok) | `backend/docker-compose.prod.yml` + `backend/prod.env` | `kaptan-prod` | API `API_PORT` (8000) |
| Geliştirme servisleri (yalnız Postgres + Redis) | `backend/docker-compose.yml` + `backend/.env` | `kaptan` | 5432, 6379 |

Üretim komutlarında kısaltma: `PROD="docker compose -f backend/docker-compose.prod.yml --env-file backend/prod.env"`.

## 1. Başlat / durdur

```bash
# Yerel: Postgres+pgvector, Redis, migrate, seed (demo günü bir kez), API, scheduler, panel
docker compose up -d --build
docker compose ps                          # api, panel, scheduler, postgres, redis: healthy · migrate, seed: Exited (0)
docker compose logs -f api                 # ya da seed / migrate / scheduler / panel
docker compose stop                        # durdur (veri kalır)
docker compose down                        # konteynerleri sil (veri kalır)
docker compose down -v                     # her şeyi sil, veritabanı dahil (sonraki up demo gününü yeniden yükler)

# Üretim biçimli
cp backend/prod.env.example backend/prod.env   # doldur; asla commit etme
$PROD up -d --build
curl -s http://127.0.0.1:8000/readyz           # {"status":"ready","checks":{"db":"ok","redis":"ok","migrations":"ok"},…}
$PROD down
```

Sıra: postgres/redis healthy → (üretim: `db-roles`) → `migrate` (alembic head, sahip rolü) → yerel: `seed`
(demo günü) / üretim: `bootstrap` (ekip, limitler v1, risk_state, kotalar, live_arm kapalı) → `api` + işçiler.

Sağlık: `GET /healthz` (canlılık), `GET /readyz` (DB, Redis, şema = alembic head; işçi kalp atışları),
`GET /api/v1/health` (demo/LLM modu ve uygulama saati). Konteyner sağlığı `python -m kaptan.ops.healthcheck`.

Demo gününü baştan almak: panelde ⚙ Ayarlar → Senaryolar → "Verileri sıfırla" (Yönetici), ya da
`docker compose run --rm seed seed_demo --force` ve ardından `docker compose restart api` (demo saati API
açılışında okunur).

### Güncel veri (canlı mod, `live.env`)

Bugünün gerçek KAP bildirimleri, gerçek Borsa İstanbul fiyatları, gerçek saat ve canlı LLM ajanları. Kayıtlı
gün verisi silinmez: canlı mod kendi veritabanı ve Redis birimlerini (`pgdata_live`, `redisdata_live`) kullanır.

```bash
docker compose down                                               # kayıtlı gün yığınını durdur (veri kalır)
docker compose --env-file live.env --profile live up -d --build   # canlı yığın, aynı portlar (:8000 / :3100)
docker compose --env-file live.env logs -f warmup                 # ilk açılış ısınması (~15-25 dk)
curl -s http://localhost:8000/api/v1/health                       # demo_mode=false, llm_mode=live, now=bugün
# Kayıtlı güne dönüş:
docker compose --env-file live.env --profile live down && docker compose up -d
```

- **Anahtarlar** `backend/.env`'den gelir (`GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY`; compose
  `env_file`). `live.env`'de sır yoktur.
- **İlk açılış (`warmup`, bir kez, tekrar çalıştırılabilir):** KAP üye listesi + son `LIVE_BACKFILL_DAYS` (5) günün
  bildirimleri (geçmiş olarak); İş Yatırım hisse listesi (sektör, piyasa değeri, halka açıklık); U4 eşiğini geçen
  en büyük `LIVE_WARMUP_MAX_TICKERS` (300) hisseye ~14 aylık günlük bar (hisse başına bir istek, ≥ 2 s arayla),
  XU100 Yahoo'dan; ardından `market_changes`, `tedbir_sync`, sıradaki seansın evreni, son seansların `pnl_eod`
  satırları (kâğıt portföy `PAPER_CAPITAL_TRY` ile nakit başlar), `regime`, `morning_brief`. `agent_worker`
  ısınma bitince başlar (öncesinde evren boş, her koşu R03'te durur).
- **Bugünün akışı:** `ingest_worker` KAP'ı seans içinde 30 s'de bir yoklar; `GET /api/v1/disclosures` günün
  bildirimlerini, `/disclosures/counters` yalnız bugünün (İstanbul) sayılarını verir.
- **Harcama sınırı:** önce LLM'siz ön eleme (gürültü/arşiv rotası, R03 evren, R04 tedbir, R13); modele giden koşu
  saatte `AGENT_MAX_RUNS_PER_HOUR` (4), günde `AGENT_MAX_RUNS_PER_DAY` (20); sağlayıcı günlük sınırları
  (`LLM_CAP_*`, DeepSeek günde $0.50) ayrıca geçerli. Sınıra takılan bildirim `capped` olur, sonradan koşmaz.
- **Gecikmeler:** KAP ~30 s; fiyat işaretleri gün sonu (18:30 `eod_prices`) ve seans içinde ~15 dk gecikmeli
  (`quotes`, yalnız açık pozisyonlar). Kaynaklar: kap.org.tr, isyatirim.com.tr, Yahoo Finance; hepsi kibar
  hızda, tek tek istek.
- Isınmayı elle tekrar: `docker compose --env-file live.env --profile live run --rm warmup` (yalnız eksikleri
  doldurur).

`DEMO_MODE` kapalıyken `seed` servisi demo günü yerine bootstrap'ı çalıştırır.

## 2. Postgres yedeği ve geri yükleme

`backend/ops/backup.sh`: `pg_dump -Fc`, isteğe bağlı age şifreleme (`AGE_RECIPIENTS`, yalnız `age1…` açık
anahtarlar), `.sha256` dosyası, `BACKUP_KEEP_DAYS` (14) gün saklama. Parola komut satırına hiç düşmez.

```bash
# Üretim: gece yedeği (cron'a koy); dosya BACKUP_HOST_DIR'e (varsayılan backend/backups) düşer
$PROD --profile backup run --rm backup

# Yerel yığın: aynı betik, postgres konteynerinin içinde
docker compose exec -T postgres sh -c \
  'BACKUP_DATABASE_URL=postgresql://kaptan_owner:$POSTGRES_PASSWORD@127.0.0.1:5432/kaptan BACKUP_OUT=- sh -s' \
  < backend/ops/backup.sh > kaptan-local.dump
```

Geri yükleme `backend/ops/restore.sh` ile ve **boş** bir veritabanına yapılır (dolu hedef için
`RESTORE_CLEAN=1`). Roller döküme girmez: önce `kaptan_app` rolü olmalı (`python -m kaptan.bootstrap roles`).

Yerel örnek: yeni bir veritabanına geri yükle, sonra zinciri doğrula.

```bash
docker compose exec postgres createdb -U kaptan_owner kaptan_restore
docker compose cp backend/ops/restore.sh postgres:/tmp/restore.sh
docker compose cp kaptan-local.dump postgres:/tmp/kaptan.dump
docker compose exec postgres sh -c \
  'RESTORE_DATABASE_URL=postgresql://kaptan_owner:$POSTGRES_PASSWORD@127.0.0.1:5432/kaptan_restore sh /tmp/restore.sh /tmp/kaptan.dump'
docker compose run --rm --no-deps api python -m kaptan.ops.backup verify --url postgresql://kaptan_owner:kaptan-local-owner@postgres:5432/kaptan_restore
```

Şifreli döküm (`*.dump.age`): `AGE_IDENTITY_FILE=<gizli anahtar dosyası>`. `verify` çıktısı
`audit verify: ok=True checked=<n> head=<hash>...` olmalıdır; `ok=False` ise o yedeği kullanma.

## 3. Durdur (kill switch) ve yeniden başlatma

Durdur: yeni emir çıkmaz, açık emirler iptal edilir (`cancel_reason = kill_switch`), pozisyon satılmaz.
Kim: Risk Sorumlusu ya da Yönetici (panel: Portföy → Durdur; API `POST /api/v1/risk/kill-switch {"reason"}`,
gerekçe ≥ 5 karakter). Otomatik olarak da devreye girer: risk monitörü zirveden −%5'te `system:risk_monitor`
adına durdurur (yalnız `DEMO_MODE` kapalıyken; günlük −%1 ise yalnız o günün yeni emirlerini keser).

Yeniden başlatma iki imza ister ve iki farklı kişi atar:

1. **Yönetici başlatır (1/2):** panelde Portföy → durdurulmuş kart → yeniden başlat; ya da
   `POST /api/v1/risk/kill-switch/reset/request {"reason": "<en az 10 karakter>"}`.
2. **Risk Sorumlusu onaylar (2/2):** `POST /api/v1/risk/kill-switch/reset/confirm {"reason": "<en az 10 karakter>"}`.
   Başlatan kişi onaylayamaz (403). Onaydan sonra düşüş ölçüsü −%4,9'a tabanlanır.

409 yanıtları: `not_on` (sistem zaten çalışıyor), `already_started` (1/2 zaten verildi), `not_started` (önce
Yönetici başlatmalı). `KAPTAN_MODE=personal` iken iki imza arasında ≥ 24 saat ve durdurmadan bu yana ≥ 5 seans
gerekir (o zamana kadar 409 `conflict`). Her adım denetim defterine yazılır (`kill_switch.on`,
`kill_switch.reset_started`, `kill_switch.reset`) ve SSE `desk` akışında `kill_switch` olayı yayımlanır.

## 4. Denetim zincirini doğrulama

Her kayıt bir öncekinin SHA-256 özetini taşır; uygulama rolü (`kaptan_app`) `audit.audit_log` üzerinde yalnız
INSERT/SELECT yapabilir, UPDATE/DELETE/TRUNCATE tetikleyiciyle herkese kapalıdır.

| Nasıl | Kim / ne zaman |
|---|---|
| Panel: Denetim → "Defteri doğrula" | Risk Sorumlusu, Yönetici, Denetçi |
| `POST /api/v1/audit/verify` (Bearer) | Aynı roller; yanıt `{"ok", "first_bad_pos", "kind", "checked", "head_hash", …}` |
| `python -m kaptan.ops.backup verify --url <postgres url>` | Bir yedeği ya da geri yüklenmiş veritabanını çevrim dışı yürür |
| Scheduler `audit_anchor`, her gün 23:30 (İstanbul) | Zinciri doğrular, başı `audit.anchors`'a yazar (`AUDIT_ANCHOR_FILE` doluysa JSON satırı olarak dosyaya da); kırık zincir: ERROR log, `audit.verify_failed` kaydı, Redis `kaptan:audit:chain_ok=0`. `DEMO_MODE`'da yalnız doğrular |
| `GET /metrics` → `audit_chain_ok` | İzleme (`METRICS_TOKEN` Bearer ya da loopback) |

Yerel yığında örnek:

```bash
TOKEN=$(curl -s -H 'Content-Type: application/json' -d '{"passphrase":"kaptan2026","role":"auditor"}' \
  http://localhost:3100/api/v1/auth/login | python -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3100/api/v1/audit/verify
```

Zincir kırıksa: o andan sonra karar verme (Durdur), `first_bad_pos` kaydını ve son sağlam yedeği bul, yedeği
boş bir veritabanına geri yükleyip `verify` ile doğrula, farkı incele. Demo gününde bilerek bozmak için:
Yönetici `POST /api/v1/demo/tamper {"on": true}` (yalnız `DEMO_MODE`).

## 5. Anahtar ve parola döndürme

Değerleri hiçbir zaman log'a, terminal geçmişine ya da depoya yazma; `prod.env` gitignore'dadır, SOPS/age için
[`SOPS-AGE.md`](SOPS-AGE.md).

| Ne | Nasıl | Etkisi |
|---|---|---|
| `JWT_SECRET` (≥ 32 bayt, rastgele) | `python -c "import secrets;print(secrets.token_urlsafe(48))"` → `prod.env` → `$PROD up -d api` | Açık erişim token'ları (15 dk) geçersiz olur; panel yenileme çereziyle yeni token alır |
| `PASSPHRASE_HASH` (giriş parolası) | `cd backend && uv run python scripts/hash_passphrase.py` → `prod.env`'e tek tırnak içinde → `$PROD up -d api` | Eski parola hemen reddedilir |
| `KAPTAN_APP_PASSWORD` (`kaptan_app` rolü) | Yeni değeri `prod.env`'e yaz → `$PROD run --rm db-roles bootstrap roles --rotate` → `$PROD up -d` (tüm uygulama servisleri yeni URL ile yeniden kurulur) | Kısa kesinti |
| `POSTGRES_PASSWORD` (`kaptan_owner`) | `$PROD run --rm -e KAPTAN_OWNER_PASSWORD=<yeni> db-roles bootstrap roles --rotate`, sonra aynı değeri `POSTGRES_PASSWORD` olarak yaz → `$PROD up -d` | migrate/bootstrap/backup yeni parolayı kullanır |
| `REDIS_PASSWORD` | `prod.env` → `$PROD up -d` (redis ve her uygulama servisi yeniden oluşur) | Kısa kesinti; Redis verisi (AOF) korunur |
| `METRICS_TOKEN` | `prod.env` → `$PROD up -d api` | İzleme tarafını güncelle |
| `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY`, `AZURE_OPENAI_API_KEY` | Sağlayıcı panelinde yeni anahtar → `prod.env` → `$PROD up -d` → eskisini iptal et | Kesintisiz |
| age anahtarları (yedek şifreleme) | [`SOPS-AGE.md`](SOPS-AGE.md): `sops updatekeys`, `AGE_RECIPIENTS` | Eski yedekler eski anahtarla açılır |

Bir ekip üyesi ayrıldığında: tüm yukarıdakileri döndür, `sops updatekeys` çalıştır.

## 6. Sık sorunlar

| Belirti | Neden / çözüm |
|---|---|
| `seed` "exit 1", `FileNotFoundError …/tests/fixtures/demo/expected/…` | Eski imaj: `docker compose build --no-cache api` (demo fikstürleri imajda olmalı) |
| `api` unhealthy, log'da `KAPTAN_ENV=prod: api refuses to start` | `prod.env` eksik/zayıf: listelenen her maddeyi düzelt (değerler log'a yazılmaz) |
| `/readyz` 503 `migrations` | Şema geride: `$PROD run --rm migrate` |
| Girişte 429 `rate_limited` | Dakikada `LOGIN_RATE_PER_MINUTE` (5) deneme; bir dakika bekle |
| Panelde giriş olur ama yenilemede oturum düşer | Paneli `localhost`/`127.0.0.1` dışında bir adla açtın: `ALLOWED_ORIGINS`'e ekle; düz http'de `COOKIE_SECURE=false` |
| Port çakışması (8000/3100) | `KAPTAN_API_PORT=8300 KAPTAN_PANEL_PORT=3300 docker compose up -d` |
| `readyz` → `ingest_worker` / `agent_worker` `missing` | Normal: canlı işçiler yalnız `--profile live` ile çalışır |
