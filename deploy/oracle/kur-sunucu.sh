#!/usr/bin/env bash
# KAPtan sunucu kurulumu (Ubuntu 24.04, ubuntu kullanıcısı, sudo ile). Tekrar çalıştırmak güvenlidir.
#   bash kur-sunucu.sh --hazirlik                 Docker, Tailscale, swap, kod, yedek klasörü (KAPtan'ı başlatmaz)
#   bash kur-sunucu.sh                            hepsi + .env'yi sorarak yazar + derler + başlatır + HTTPS yayını
#   bash kur-sunucu.sh --env-from DOSYA           .env'yi bilgisayardaki .env'den al (aynı parola, aynı anahtarlar)
#   --kilitle                                     ufw: Tailscale dışından gelen her şeyi kapat (SSH dahil)
# Gizli değerler ekrana yazılmaz.
set -euo pipefail

REPO_URL=https://github.com/cozalss/kaptan-seng429
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIN_PW=6
MAX_PW=200
PREP_ONLY=0
ENV_FROM=""
LOCK=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --hazirlik) PREP_ONLY=1 ;;
    --env-from) ENV_FROM="${2:?--env-from bir dosya ister}"; shift ;;
    --kilitle) LOCK=1 ;;
    *) echo "Bilinmeyen seçenek: $1" >&2; exit 2 ;;
  esac
  shift
done
[ "$(id -u)" -ne 0 ] || { echo 'HATA: root olarak değil, ubuntu kullanıcısıyla çalıştır (sudo kendisi istenir).' >&2; exit 1; }

# --- kod: bu betik repo içinden çalışıyorsa orası, değilse ~/kaptan-seng429 ---------------------------------------
if [ -f "$SELF_DIR/../../docker-compose.yml" ]; then
  # shellcheck source=lib.sh
  . "$SELF_DIR/lib.sh"
else
  command -v git >/dev/null 2>&1 || { sudo apt-get update -qq && sudo apt-get install -y -qq git; }
  if [ -d "$HOME/kaptan-seng429/.git" ]; then
    git -C "$HOME/kaptan-seng429" pull --ff-only
  else
    git clone "$REPO_URL" "$HOME/kaptan-seng429"
  fi
  exec bash "$HOME/kaptan-seng429/deploy/oracle/kur-sunucu.sh" "$@"
fi
git -C "$REPO_DIR" pull --ff-only || say 'Not: git pull yapılamadı (yerel değişiklik olabilir); mevcut kodla devam.'

install_base() {
  say '1/7 Temel paketler...'
  sudo apt-get update -qq
  sudo apt-get install -y -qq ca-certificates curl git python3 openssl >/dev/null
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    say '2/7 Docker zaten kurulu.'
  else
    say '2/7 Docker kuruluyor (resmi apt deposundan)...'
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc
    # shellcheck disable=SC1091
    codename="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")"
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable" \
      | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  fi
  sudo systemctl enable --now docker >/dev/null 2>&1 || true
  id -nG "$USER" | grep -qw docker || sudo usermod -aG docker "$USER"
}

install_tailscale() {
  if ! command -v tailscale >/dev/null 2>&1; then
    say '3/7 Tailscale kuruluyor...'
    curl -fsSL https://tailscale.com/install.sh | sh
  else
    say '3/7 Tailscale zaten kurulu.'
  fi
  if [ -z "$(tailnet_name)" ]; then
    say 'Tailscale girişi: aşağıda bir bağlantı çıkacak. Bilgisayarındaki tarayıcıda aç, Tailscale hesabınla onayla.'
    sudo tailscale up --ssh --hostname=kaptan-sunucu
  fi
  say "Tailscale adresin: $(tailnet_name)"
}

setup_swap() {
  if swapon --show=NAME --noheadings | grep -q '^/swapfile'; then
    say '4/7 Swap zaten var.'
    return
  fi
  say '4/7 2 GB swap dosyası...'
  if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile >/dev/null
  fi
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
}

setup_backup_dir() {
  say '5/7 Yedek klasörü...'
  sudo mkdir -p "$BACKUP_DIR_DEFAULT"
  # scheduler (uid 10001) çapa dosyasını buraya yazar; yedek servisi root; ubuntu okur.
  sudo chown 10001:10001 "$BACKUP_DIR_DEFAULT"
  sudo chmod 775 "$BACKUP_DIR_DEFAULT"
}

lock_firewall() {
  [ "$LOCK" = 1 ] || return 0
  [ -n "$(tailnet_name)" ] || fail 'Tailscale bağlı değil; kilitlemek seni dışarıda bırakır.'
  say 'Güvenlik duvarı: yalnız Tailscale içinden erişim...'
  sudo apt-get install -y -qq ufw >/dev/null
  sudo ufw default deny incoming >/dev/null
  sudo ufw default allow outgoing >/dev/null
  sudo ufw allow in on tailscale0 >/dev/null
  sudo ufw --force enable >/dev/null
  say 'Kilitlendi. Genel IP üzerinden SSH artık kapalı; Tailscale üzerinden bağlan.'
}

# --- .env ----------------------------------------------------------------------------------------------------------
new_secret() {
  python3 -c 'import secrets,sys; a="abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; print("".join(secrets.choice(a) for _ in range(int(sys.argv[1]))))' "$1"
}

ask_password() {
  local p1 p2
  while true; do
    read -rsp "Yeni parolan (en az $MIN_PW karakter, yazarken görünmez): " p1; echo
    if [ "${#p1}" -lt "$MIN_PW" ]; then say "Parola en az $MIN_PW karakter olmalı."; continue; fi
    if [ "${#p1}" -gt "$MAX_PW" ]; then say "Parola en fazla $MAX_PW karakter olabilir."; continue; fi
    if [ "$p1" = kaptan2026 ]; then say 'Bu parola herkesçe biliniyor. Başka bir parola seç.'; continue; fi
    read -rsp 'Aynı parolayı bir daha yaz: ' p2; echo
    if [ "$p1" = "$p2" ]; then PASSWORD="$p1"; return; fi
    say 'İki parola aynı değil.'
  done
}

hash_password() {  # parola stdin'den imaja gider, komut satırına değil
  printf '%s' "$PASSWORD" | dk run --rm -i --network none --entrypoint python kaptan-backend:local -c \
    'import sys; from pwdlib import PasswordHash; print(PasswordHash.recommended().hash(sys.stdin.buffer.read().decode("utf-8").rstrip("\r\n")))'
}

ask_keys() {
  say 'Sağlayıcı anahtarları. Enter: olduğu gibi kalsın. Yazdığın görünmez.'
  local name typed state
  for name in GEMINI_API_KEY DEEPSEEK_API_KEY GROQ_API_KEY; do
    state=boş
    [ -z "$(get_env "$name")" ] || state=kayıtlı
    read -rsp "$name ($state): " typed; echo
    if [ -n "$typed" ]; then set_env "$name" "$(printf '%s' "$typed" | tr -d '[:space:]')"; fi
  done
  if [ -z "$(get_env GEMINI_API_KEY)$(get_env DEEPSEEK_API_KEY)$(get_env GROQ_API_KEY)" ]; then
    fail 'En az bir sağlayıcı anahtarı gerekli.'
  fi
}

write_env() {
  local fresh=0 spec name hash
  if [ -n "$ENV_FROM" ]; then
    [ -f "$ENV_FROM" ] || fail "Dosya yok: $ENV_FROM"
    cp "$ENV_FROM" "$REPO_DIR/.env"
    chmod 600 "$REPO_DIR/.env"
    say '6/7 .env bilgisayardaki dosyadan alındı (parola ve anahtarlar aynı).'
  elif [ -f "$REPO_DIR/.env" ] && [ -n "$(get_env JWT_SECRET)" ]; then
    say '6/7 .env var; gizli anahtarlar korunuyor.'
  else
    fresh=1
    say '6/7 .env yazılıyor.'
    : >"$REPO_DIR/.env"
    chmod 600 "$REPO_DIR/.env"
    for spec in JWT_SECRET:64 POSTGRES_PASSWORD:40 KAPTAN_APP_PASSWORD:40 REDIS_PASSWORD:40; do
      set_env "${spec%%:*}" "$(new_secret "${spec##*:}")"
    done
    ask_password
    ask_keys
    set_env ALERT_NTFY_TOPIC "kaptan-$(new_secret 24)"
    say 'Telefon bildirimi için konu adı üretildi (kimseyle paylaşma). Görmek için:'
    say "  grep ALERT_NTFY_TOPIC $REPO_DIR/.env   ; telefondaki ntfy uygulamasında bu konuya abone ol."
  fi
  # Sunucuya özgü değerler: PC'den gelen .env'deki Windows yolunun yerine.
  set_env KAPTAN_BACKUP_DIR "$BACKUP_DIR_DEFAULT"
  set_env COMPOSE_FILE docker-compose.yml:deploy/oracle/docker-compose.server.yml
  set_env KAPTAN_PUBLIC_ORIGIN "https://$(tailnet_name)"
  if [ "$fresh" = 1 ]; then
    say 'Uygulama imajı derleniyor (ARM üzerinde ilk seferde 5-10 dakika)...'
    dk build -q -t kaptan-backend:local "$REPO_DIR/backend" >/dev/null
    hash="$(hash_password)"
    case "$hash" in '$argon2'*) ;; *) fail 'Parola özeti üretilemedi.' ;; esac
    set_env PASSPHRASE_HASH "$hash"
  fi
  for name in JWT_SECRET PASSPHRASE_HASH POSTGRES_PASSWORD KAPTAN_APP_PASSWORD REDIS_PASSWORD; do
    [ -n "$(get_env "$name")" ] || fail ".env içinde $name yok."
  done
  unset PASSWORD
}

build_and_start() {
  say '7/7 Derleniyor ve başlatılıyor...'
  dk build -q -t kaptan-backend:local "$REPO_DIR/backend" >/dev/null
  dc build
  dc up -d --remove-orphans
  wait_panel || { dc ps; fail 'KAPtan 5 dakikada hazır olmadı. docker compose logs ile bak.'; }
  sudo tailscale serve --bg --https=443 http://127.0.0.1:3100 \
    || fail 'tailscale serve başarısız: Tailscale yönetim sayfasında HTTPS sertifikalarını aç (REHBER.md).'
}

install_base
install_docker
install_tailscale
setup_swap
setup_backup_dir
if [ "$PREP_ONLY" = 1 ]; then
  lock_firewall
  say 'Hazırlık tamam. Sonraki adım: REHBER.md.'
  exit 0
fi
write_env
build_and_start
lock_firewall
say ''
say "Hazır. Telefonundan ya da bilgisayarından aç: $(get_env KAPTAN_PUBLIC_ORIGIN)"
say 'İlk kurulumda geçmiş veriler 15-25 dakika yüklenir; o sırada öneri çıkmaz.'
say 'Eski veriyi PC den taşıyacaksan şimdi: bash deploy/oracle/geri-yukle-sunucu.sh'
