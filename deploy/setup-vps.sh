#!/usr/bin/env bash
# Setup one-shot na VPS Ubuntu (Hostinger).
# Uso (na VPS, como root ou com sudo):
#   curl -fsSL ... | bash
#   ou: bash setup-vps.sh

set -euo pipefail

APP_NAME="libertybegin"
DOMAIN="libertybegin.iamcontrol.com.br"
WEB_ROOT="/var/www/${APP_NAME}"
NGINX_AVAIL="/etc/nginx/sites-available/${APP_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${APP_NAME}"

echo "==> Atualizando pacotes e instalando nginx + node (para build local opcional)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx curl ca-certificates

# Node 22 LTS (só se for buildar na VPS; deploy via rsync não precisa)
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> Criando diretório web ${WEB_ROOT}"
mkdir -p "${WEB_ROOT}"
chown -R www-data:www-data "${WEB_ROOT}"

# Placeholder enquanto o primeiro deploy não sobe
if [[ ! -f "${WEB_ROOT}/index.html" ]]; then
  cat > "${WEB_ROOT}/index.html" <<EOF
<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${APP_NAME}</title></head>
<body style="font-family:system-ui;padding:2rem"><h1>${DOMAIN}</h1>
<p>Aguardando primeiro deploy.</p></body></html>
EOF
fi

echo "==> Configurando Nginx"
if [[ -f "./nginx-libertybegin.conf" ]]; then
  cp ./nginx-libertybegin.conf "${NGINX_AVAIL}"
elif [[ -f "./deploy/nginx-libertybegin.conf" ]]; then
  cp ./deploy/nginx-libertybegin.conf "${NGINX_AVAIL}"
else
  echo "ERRO: nginx-libertybegin.conf não encontrado no diretório atual."
  exit 1
fi

ln -sfn "${NGINX_AVAIL}" "${NGINX_ENABLED}"

# Remover default se conflitar na porta 80 (opcional — comente se outros sites usam default)
# rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl reload nginx

echo ""
echo "OK. Nginx ativo para ${DOMAIN}"
echo "Próximos passos:"
echo "  1. Cloudflare DNS: A ${DOMAIN} → IP da VPS (Proxy laranja ou DNS only)"
echo "  2. Cloudflare SSL/TLS: Full (não Flexible) se tiver cert no origin"
echo "  3. Rodar deploy.sh da sua máquina para publicar o build"
echo "  4. Supabase Auth → Site URL + Redirect URLs com https://${DOMAIN}"
