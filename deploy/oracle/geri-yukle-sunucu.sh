#!/usr/bin/env bash
# PC den taşınan yedeği sunucudaki yeni KAPtan a açar (geri-yukle.ps1 in aynısı) ve doğrular.
#   bash geri-yukle-sunucu.sh [kaptan-....dump]     (boş: ~/kaptan-tasi içindeki en yeni)
# Sıra: yedeği yedek klasörüne koy -> ayrı veritabanına aç -> zincir+çapa doğrula -> uygulamayı durdur ->
# yenisiyle değiştir (eskisi kaptan_eski_... adıyla kalır) -> migrate + bootstrap -> başlat -> son doğrulamalar.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_env
APP_SERVICES=(panel api scheduler ingest_worker agent_worker warmup)
BACKUP_DIR="$(get_env KAPTAN_BACKUP_DIR)"
BACKUP_DIR="${BACKUP_DIR:-$BACKUP_DIR_DEFAULT}"

req="${1:-}"
if [ -n "$req" ]; then
  dump="$(basename "$req")"
else
  dump="$(find "$TASI_DIR" -maxdepth 1 -name 'kaptan-*.dump' -printf '%f\n' 2>/dev/null | sort | tail -n1)"
fi
[ -n "$dump" ] || fail "$TASI_DIR içinde yedek yok. Önce PC de tasi-pc.ps1 çalıştır."
[ -f "$TASI_DIR/$dump" ] || fail "Yedek bulunamadı: $TASI_DIR/$dump"

say "Yedek yedek klasörüne konuyor: $dump"
sudo cp "$TASI_DIR/$dump" "$BACKUP_DIR/"
if [ -f "$TASI_DIR/$dump.sha256" ]; then sudo cp "$TASI_DIR/$dump.sha256" "$BACKUP_DIR/"; fi
if [ -f "$TASI_DIR/audit-anchors.jsonl" ]; then
  sudo cp "$TASI_DIR/audit-anchors.jsonl" "$BACKUP_DIR/audit-anchors.jsonl"
  sudo chown 10001:10001 "$BACKUP_DIR/audit-anchors.jsonl"
fi

dc up -d --wait postgres backup
if ! dc exec -T backup sh /ops/restore-into.sh "$dump"; then
  dc exec -T backup sh /ops/restore-into.sh --drop || true
  fail 'Yedek açılamadı. Canlı (boş) veriye dokunulmadı.'
fi
say 'Kayıtlar doğrulanıyor (zincir ve çapa dosyası)...'
if ! dc run --rm --no-deps -T --entrypoint sh scheduler /ops/verify-restore.sh; then
  dc exec -T backup sh /ops/restore-into.sh --drop || true
  fail 'Bu yedeğin kayıtları doğrulanmadı. KULLANMA. Daha eski bir yedeği dene.'
fi

say 'Uygulama kısa süre duruyor, veritabanı değiştiriliyor...'
dc stop "${APP_SERVICES[@]}"
old="kaptan_eski_$(date +%Y%m%d_%H%M%S)"
dc exec -T backup sh /ops/restore-into.sh --swap "$old"
say "Geçildi. Boş eski veritabanı $old adıyla duruyor."

say 'Migrate + bootstrap (yeni kod yedekten ilerideyse tamamlar)...'
dc run --rm migrate
dc run --rm bootstrap
dc up -d --remove-orphans
wait_panel || { dc ps; fail 'KAPtan hazır olmadı.'; }

say ''
say '=== Doğrulama ==='
status=0
# 1) alembic head
alembic_out="$(dc run --rm --no-deps -T --entrypoint sh migrate -c 'alembic current 2>/dev/null; echo ---; alembic heads 2>/dev/null' || true)"
cur="$(printf '%s\n' "$alembic_out" | sed -n '1,/^---$/p' | grep -oE '^[0-9a-z_]+' | head -n1 || true)"
head_rev="$(printf '%s\n' "$alembic_out" | sed '1,/^---$/d' | grep -oE '^[0-9a-z_]+' | head -n1 || true)"
if [ -n "$cur" ] && [ "$cur" = "$head_rev" ]; then
  say "OK    alembic head: $cur"
else
  say "HATA  alembic: şimdiki=$cur, head=$head_rev"
  status=1
fi
# 2) başlangıç parası satırları
SQL="SELECT count(*) || ' ' || coalesce(sum(cash_delta),0) FROM trading.book_ledger WHERE kind='start' AND book_no=(SELECT max(no) FROM trading.book_epochs)"
got="$(dc exec -T postgres psql -qtAX -U kaptan_owner -d kaptan -c "$SQL" | tr -d '\r')"
say "      başlangıç satırı / tutar (sunucu): $got"
if [ -f "$TASI_DIR/kontrol.txt" ]; then
  want="$(grep -E '^baslangic=' "$TASI_DIR/kontrol.txt" | cut -d= -f2- || true)"
  if [ -n "$want" ] && [ "$want" = "$got" ]; then
    say "OK    başlangıç parası PC ile aynı: $want"
  else
    say "HATA  başlangıç parası PC dekinden farklı (PC: ${want:-yok})"
    status=1
  fi
  want_n="$(grep -E '^defter=' "$TASI_DIR/kontrol.txt" | cut -d= -f2- || true)"
  got_n="$(dc exec -T postgres psql -qtAX -U kaptan_owner -d kaptan -c 'SELECT count(*) FROM trading.book_ledger' | tr -d '\r')"
  if [ -n "$want_n" ] && [ "$want_n" = "$got_n" ]; then
    say "OK    defter satırı sayısı aynı: $got_n"
  else
    say "UYARI defter satırı PC: ${want_n:-yok}, sunucu: $got_n (PC yedekten sonra yazmış olabilir)"
  fi
else
  say 'UYARI kontrol.txt yok; PC ile karşılaştırma atlandı.'
fi
# 3) kayıt zinciri + çapa, uygulama rolüyle, canlı veritabanında
if dc run --rm --no-deps -T --entrypoint sh scheduler -c 'python -m kaptan.ops.backup verify --url "$DATABASE_URL" --anchors "$AUDIT_ANCHOR_FILE"'; then
  say 'OK    kayıt zinciri sağlam'
else
  say 'HATA  kayıt zinciri doğrulanamadı'
  status=1
fi
say ''
if [ "$status" = 0 ]; then
  say 'TAŞIMA BAŞARILI.'
  say 'ŞİMDİ PC de .\durdur.ps1 çalıştır: iki KAPtan aynı anda çalışmasın (çift bildirim, çift LLM harcaması).'
  say "Telefonunda aç: $(get_env KAPTAN_PUBLIC_ORIGIN)"
else
  say 'Bazı doğrulamalar başarısız. PC deki KAPtan ı KAPATMA; yukarıdaki HATA satırlarını göster.'
  exit 1
fi
