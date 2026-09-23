# Deploy na VPS (Hostinger Ubuntu) — libertybegin.iamcontrol.com.br

SPA Vite estática. Backend = Supabase (não roda Node na VPS).

## 1. Cloudflare DNS

No domínio `iamcontrol.com.br`:

| Tipo | Nome | Conteúdo | Proxy |
|------|------|----------|-------|
| A | libertybegin | IP da VPS | Proxied (laranja) |

SSL/TLS no Cloudflare: **Full** (recomendado com Certbot ou Origin Cert no Nginx). Evite Flexible.

## 2. Setup na VPS (uma vez)

```bash
# No seu PC — enviar scripts
scp -P PORTA deploy/nginx-libertybegin.conf deploy/setup-vps.sh USUARIO@IP:/tmp/

# Na VPS
ssh -p PORTA USUARIO@IP
cd /tmp
sudo bash setup-vps.sh
```

## 3. Deploy do site (a cada release)

No PC, na pasta do projeto (com `.env` preenchido):

```bash
# Git Bash / WSL / Linux / macOS
export VPS_HOST=SEU_IP
export VPS_USER=SEU_USUARIO
export VPS_PORT=22
# export VPS_KEY=~/.ssh/id_rsa   # se usar chave
bash deploy/deploy.sh
```

No PowerShell (Windows), use WSL ou Git Bash; o script é bash.

## 4. HTTPS

**Opção A — Certbot (DNS Cloudflare DNS-only ou Full após cert):**

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d libertybegin.iamcontrol.com.br
```

**Opção B — Cloudflare Origin Certificate** (Full Strict):

1. Cloudflare → SSL/TLS → Origin Server → Create Certificate  
2. Salvar em `/etc/ssl/cloudflare/libertybegin.pem` e `.key`  
3. Descomentar o bloco HTTPS em `nginx-libertybegin.conf` e `nginx -t && systemctl reload nginx`

## 5. Supabase Auth (obrigatório)

Dashboard → Authentication → URL Configuration:

- **Site URL:** `https://libertybegin.iamcontrol.com.br`
- **Redirect URLs:**  
  `https://libertybegin.iamcontrol.com.br/**`  
  `http://localhost:8080/**` (dev)

Sem isso, login / reset de senha falham.

## 6. Firewall Hostinger

Liberar portas **80** e **443** (e a SSH que você já usa).
