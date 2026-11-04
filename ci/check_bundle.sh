#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d dist ] || { echo 'dist_missing' >&2; exit 2; }
if grep -RInE 'sk-[A-Za-z0-9_-]{20,}|DATABASE_URL|BIBLE_RESTRICTED_DATA_KEY|CLIENT_SECRET|PRIVATE_KEY|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY' dist >/tmp/bible_bundle_secret_hits 2>/dev/null; then
  cat /tmp/bible_bundle_secret_hits >&2
  exit 3
fi
printf '%s\n' 'BIBLE_APP_BUNDLE_SECRET_SCAN_OK'
