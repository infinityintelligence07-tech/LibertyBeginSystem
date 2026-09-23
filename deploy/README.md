# Deploy Liberty Begin

SPA Vite estática. Backend = Supabase. Domínio: **https://begin.libertymentoria.com.br**

## Deploy automático (GitHub Actions)

A cada push em `main`, o workflow `.github/workflows/deploy.yml` conecta na VPS e roda `/opt/libertybegin/deploy-vps.sh`.

### Secrets do repositório

GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Valor |
|--------|--------|
| `VPS_HOST` | `187.77.195.178` |
| `VPS_USER` | `root` |
| `VPS_PORT` | `22` |
| `VPS_SSH_KEY` | chave privada completa (`-----BEGIN OPENSSH PRIVATE KEY-----` …) |

A chave já foi gerada e a pública está em `/root/.ssh/authorized_keys` na VPS. Cópia local da privada: `%USERPROFILE%\.ssh\libertybegin_vps_deploy`.

### Pré-requisitos na VPS (já feitos)

- Clone em `/opt/libertybegin`
- `.env` com `VITE_SUPABASE_*` em `/opt/libertybegin/.env` (não versionado)
- Script `deploy-vps.sh` e Nginx em `/var/www/libertybegin`

### Deploy manual na VPS

```bash
bash /opt/libertybegin/deploy-vps.sh
```

---

## DNS / SSL (referência)

Domínio principal: `begin.libertymentoria.com.br` (A → IP da VPS).  
Legado: `libertybegin.iamcontrol.com.br`.

## Deploy local (opcional)

```bash
export VPS_HOST=187.77.195.178
export VPS_USER=root
export VPS_PORT=22
export VPS_KEY=~/.ssh/libertybegin_vps_deploy
bash deploy/deploy.sh
```

## Supabase Auth

- **Site URL:** `https://begin.libertymentoria.com.br`
- **Redirect URLs:** `https://begin.libertymentoria.com.br/**`
