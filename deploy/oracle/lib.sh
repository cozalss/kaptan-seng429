# shellcheck shell=bash
# KAPtan sunucu betiklerinin ortak parçaları (kur-sunucu.sh, baslat.sh, ... bunu "source" eder).
# Hiçbir gizli değeri ekrana yazmaz.

ORACLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$ORACLE_DIR/../.." && pwd)"
BACKUP_DIR_DEFAULT=/srv/kaptan-yedek
TASI_DIR="$HOME/kaptan-tasi"

say() { printf '%s\n' "$*"; }
fail() { printf 'HATA: %s\n' "$*" >&2; exit 1; }

# docker: grup üyeliği henüz geçerli değilse sudo ile.
dk() { if docker info >/dev/null 2>&1; then docker "$@"; else sudo docker "$@"; fi; }
dc() { (cd "$REPO_DIR" && dk compose "$@"); }

# .env içinde NAME='değer' satırını ekler ya da değiştirir (değer ekrana yazılmaz).
set_env() {
  local name="$1" value="$2" file="$REPO_DIR/.env" tmp
  case "$value" in *"'"*) fail "$name değerinde ' olamaz." ;; esac
  tmp="$(mktemp)"
  { grep -v "^${name}=" "$file" 2>/dev/null || true; printf "%s='%s'\n" "$name" "$value"; } >"$tmp"
  cat "$tmp" >"$file"
  rm -f "$tmp"
  chmod 600 "$file"
}

get_env() { sed -n "s/^$1='\(.*\)'$/\1/p" "$REPO_DIR/.env" | head -n1; }

need_env() { [ -f "$REPO_DIR/.env" ] || fail "KAPtan kurulu değil. Önce kur-sunucu.sh çalıştır."; }

tailnet_name() {
  sudo tailscale status --json 2>/dev/null | python3 -c \
    'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null || true
}

wait_panel() {
  local port tries=100
  port="$(get_env KAPTAN_PANEL_PORT)"; port="${port:-3100}"
  while [ "$tries" -gt 0 ]; do
    if curl -fsS -o /dev/null "http://127.0.0.1:$port/api/v1/health" 2>/dev/null \
       && curl -fsS -o /dev/null "http://127.0.0.1:$port/login" 2>/dev/null; then return 0; fi
    sleep 3; tries=$((tries - 1))
  done
  return 1
}
