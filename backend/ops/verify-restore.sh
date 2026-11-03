#!/bin/sh
# Walk the audit chain of the scratch database kaptan_restore, and compare it with the anchor file in the backup
# folder, as the app role: the grants that came with the dump are tested too. Runs in the backend image with the
# backup folder mounted (geri-yukle.ps1). Exit 0 only when the ledger verifies.
set -eu
RESTORE_DATABASE_URL="${DATABASE_URL%/*}/kaptan_restore"
export RESTORE_DATABASE_URL
exec python -m kaptan.ops.backup verify --anchors "$AUDIT_ANCHOR_FILE"
