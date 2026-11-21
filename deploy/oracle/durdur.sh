#!/usr/bin/env bash
# KAPtan'ı durdurur. Veriler silinmez. Yeniden başlatmak için baslat.sh.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_env
dc stop
say 'Durdu. Veriler yerinde. Başlatmak için: bash deploy/oracle/baslat.sh'
