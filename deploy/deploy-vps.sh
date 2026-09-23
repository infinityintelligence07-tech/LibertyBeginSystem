#!/usr/bin/env bash
# Deploy na VPS: puxa main, builda e publica no Nginx.
# Uso (como root na VPS):
#   bash /opt/libertybegin/deploy-vps.sh
set -euo pipefail

SRC=/opt/libertybegin
WEB=/var/www/libertybegin

cd "$SRC"

echo "==> git pull (origin/main)"
git fetch origin
git reset --hard origin/main

if [[ ! -f .env ]]; then
  echo "ERRO: falta $SRC/.env com VITE_SUPABASE_* (necessario no build)"
  exit 1
fi

echo "==> npm install"
npm install --legacy-peer-deps

echo "==> vite build"
npm run build

if [[ ! -d dist ]]; then
  echo "ERRO: pasta dist/ nao gerada"
  exit 1
fi

echo "==> publicar em $WEB"
rsync -a --delete "$SRC/dist/" "$WEB/"
chown -R www-data:www-data "$WEB"

echo "OK - https://begin.libertymentoria.com.br"