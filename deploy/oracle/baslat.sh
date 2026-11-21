#!/usr/bin/env bash
# KAPtan'ı sunucuda başlatır (ve gerekirse Tailscale HTTPS yayınını yeniler).
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_env
say 'KAPtan başlıyor...'
dc up -d --remove-orphans
wait_panel || { dc ps; fail 'KAPtan 5 dakikada hazır olmadı.'; }
sudo tailscale serve --bg --https=443 http://127.0.0.1:3100 >/dev/null 2>&1 || say 'Not: tailscale serve yenilenemedi (Tailscale açık mı?).'
say "Hazır: $(get_env KAPTAN_PUBLIC_ORIGIN)"
