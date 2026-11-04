#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --no-audit --no-fund
npm run lint
npm run test:logic
npm test
npm run build
bash ci/check_bundle.sh
printf '%s\n' 'BIBLE_APP_VERIFY_OK (browser smoke is a separate gate)'
