#!/usr/bin/env bash
# Pull + build + restart. Run on the EC2 host from ${APP_DIR}.
set -euo pipefail

APP_DIR=/opt/ads-mangment
WEB_ROOT=/var/www/ads-mangment

cd "${APP_DIR}"

echo "==> git pull"
git fetch --all --prune
git reset --hard origin/main

echo "==> backend deps"
cd "${APP_DIR}/backend"
npm ci --omit=dev

echo "==> db migrations"
NODE_ENV=production node --env-file=.env node_modules/.bin/knex migrate:latest
NODE_ENV=production node --env-file=.env node_modules/.bin/knex seed:run

echo "==> frontend build"
cd "${APP_DIR}/frontend"
npm ci
npm run build

echo "==> publish frontend to ${WEB_ROOT}"
sudo rsync -a --delete "${APP_DIR}/frontend/dist/" "${WEB_ROOT}/"

echo "==> reload backend"
if pm2 describe ads-mangment-backend >/dev/null 2>&1; then
  pm2 reload ads-mangment-backend --update-env
else
  pm2 start "${APP_DIR}/scripts/deploy/ecosystem.config.cjs"
fi

echo "==> done"
