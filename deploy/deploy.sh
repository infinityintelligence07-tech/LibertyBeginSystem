#!/usr/bin/env bash
# Build local + envio para a VPS via rsync/scp.
#
# Uso:
#   export VPS_HOST=IP_OU_HOSTNAME
#   export VPS_USER=root          # ou ubuntu / uXXXX
#   export VPS_PORT=22
#   # opcional: export VPS_KEY=~/.ssh/id_rsa
#   bash deploy/deploy.sh
#
# Requer: Node.js local, .env com VITE_SUPABASE_* preenchido.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

: "${VPS_HOST:?Defina VPS_HOST (IP ou hostname)}"
: "${VPS_USER:?Defina VPS_USER}"
VPS_PORT="${VPS_PORT:-22}"
REMOTE_DIR="/var/www/libertybegin"

SSH_OPTS=(-p "$VPS_PORT" -o StrictHostKeyChecking=accept-new)
if [[ -n "${VPS_KEY:-}" ]]; then
  SSH_OPTS+=(-i "$VPS_KEY")
fi

if [[ ! -f .env ]]; then
  echo "ERRO: .env não encontrado. Copie de .env.example e preencha."
  exit 1
fi

echo "==> npm ci / install"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

echo "==> vite build (injeta VITE_* do .env)"
npm run build

if [[ ! -d dist ]]; then
  echo "ERRO: pasta dist/ não gerada"
  exit 1
fi

echo "==> Enviando dist/ → ${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}"
if command -v rsync >/dev/null 2>&1; then
  rsync -avz --delete \
    -e "ssh ${SSH_OPTS[*]}" \
    dist/ "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/"
else
  # Fallback Windows/Git Bash sem rsync: tar via ssh
  tar -C dist -czf - . | ssh "${SSH_OPTS[@]}" "${VPS_USER}@${VPS_HOST}" \
    "mkdir -p ${REMOTE_DIR} && tar -C ${REMOTE_DIR} -xzf - && chown -R www-data:www-data ${REMOTE_DIR}"
fi

ssh "${SSH_OPTS[@]}" "${VPS_USER}@${VPS_HOST}" \
  "chown -R www-data:www-data ${REMOTE_DIR} && nginx -t && systemctl reload nginx"

echo ""
echo "Deploy OK → https://libertybegin.iamcontrol.com.br"
echo "Confira no Supabase Auth os Redirect URLs com esse domínio."
