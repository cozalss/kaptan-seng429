#!/usr/bin/env bash
# Kodu GitHub'dan çeker, yeniden derler, yeniden başlatır. Veri silinmez.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_env
say 'Kod çekiliyor...'
git -C "$REPO_DIR" pull --ff-only
say 'Derleniyor (birkaç dakika sürebilir)...'
dk build -t kaptan-backend:local "$REPO_DIR/backend" >/dev/null
dc build
dc up -d --remove-orphans
wait_panel || { dc ps; fail 'KAPtan 5 dakikada hazır olmadı. docker compose logs api ile bak.'; }
say 'Güncellendi ve çalışıyor.'
