#!/bin/sh
set -eu
# Apply database migrations, then encrypt/rotate any stored credentials (both idempotent).
echo "[entrypoint] applying migrations"
node node_modules/prisma/build/index.js migrate deploy
echo "[entrypoint] checking stored credentials"
node node_modules/tsx/dist/cli.mjs scripts/rotate_secrets.ts || echo "[entrypoint] rotate-secrets reported a problem (see above); the app will still start"
exec "$@"
