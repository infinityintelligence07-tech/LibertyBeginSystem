#!/usr/bin/env python3
"""One-shot deploy LibertyBegin to Hostinger VPS. Credentials via env only."""
import os
import sys
import stat
from pathlib import Path

import paramiko

HOST = os.environ["VPS_HOST"]
USER = os.environ.get("VPS_USER", "root")
PORT = int(os.environ.get("VPS_PORT", "22"))
PASSWORD = os.environ["VPS_PASSWORD"]
LOCAL_ROOT = Path(os.environ.get("LOCAL_ROOT", ".")).resolve()
REMOTE_WEB = "/var/www/libertybegin"
DOMAIN = "libertybegin.iamcontrol.com.br"

NGINX_CONF = f"""server {{
    listen 80;
    listen [::]:80;
    server_name {DOMAIN};

    root {REMOTE_WEB};
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
    gzip_min_length 256;

    location /assets/ {{
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }}

    location / {{
        try_files $uri $uri/ /index.html;
    }}

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location ~ /\\. {{
        deny all;
    }}
}}
"""


def run(ssh: paramiko.SSHClient, cmd: str, check: bool = True) -> tuple[int, str, str]:
    print(f"$ {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    if check and code != 0:
        raise RuntimeError(f"Command failed ({code}): {cmd}")
    return code, out, err


def sftp_mkdirs(sftp: paramiko.SFTPClient, remote: str) -> None:
    parts = remote.strip("/").split("/")
    cur = ""
    for p in parts:
        cur += "/" + p
        try:
            sftp.stat(cur)
        except FileNotFoundError:
            sftp.mkdir(cur)


def upload_dir(sftp: paramiko.SFTPClient, local: Path, remote: str) -> int:
    count = 0
    sftp_mkdirs(sftp, remote)
    for root, dirs, files in os.walk(local):
        rel = Path(root).relative_to(local)
        rdir = remote if str(rel) == "." else f"{remote}/{rel.as_posix()}"
        try:
            sftp.stat(rdir)
        except FileNotFoundError:
            sftp.mkdir(rdir)
        for f in files:
            lp = Path(root) / f
            rp = f"{rdir}/{f}"
            sftp.put(str(lp), rp)
            count += 1
            if count % 20 == 0:
                print(f"  uploaded {count} files...")
    return count


def main() -> None:
    dist = LOCAL_ROOT / "dist"
    if not dist.is_dir():
        raise SystemExit(f"dist/ not found at {dist}")

    print(f"Connecting {USER}@{HOST}:{PORT} ...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    # Hostinger often uses keyboard-interactive; disable agent/keys so password is used.
    try:
        ssh.connect(
            HOST,
            port=PORT,
            username=USER,
            password=PASSWORD,
            timeout=30,
            allow_agent=False,
            look_for_keys=False,
        )
    except paramiko.AuthenticationException:
        print("Password auth failed; trying keyboard-interactive...")
        transport = paramiko.Transport((HOST, PORT))
        transport.connect()

        def _handler(title, instructions, prompt_list):
            return [PASSWORD for _ in prompt_list]

        transport.auth_interactive(USER, _handler)
        ssh._transport = transport

    run(ssh, "export DEBIAN_FRONTEND=noninteractive; apt-get update -y && apt-get install -y nginx curl ca-certificates")
    run(ssh, f"mkdir -p {REMOTE_WEB}")
    run(ssh, "ls -la /etc/nginx/sites-enabled/ || true", check=False)

    # Write nginx conf via SFTP
    sftp = ssh.open_sftp()
    with sftp.file("/etc/nginx/sites-available/libertybegin", "w") as f:
        f.write(NGINX_CONF)
    sftp.close()

    run(ssh, "ln -sfn /etc/nginx/sites-available/libertybegin /etc/nginx/sites-enabled/libertybegin")
    run(ssh, "nginx -t")
    run(ssh, "systemctl enable nginx && systemctl reload nginx")

    # Clear remote web root files then upload (keep dir)
    run(ssh, f"find {REMOTE_WEB} -mindepth 1 -delete")

    print(f"Uploading {dist} -> {REMOTE_WEB}")
    sftp = ssh.open_sftp()
    n = upload_dir(sftp, dist, REMOTE_WEB)
    sftp.close()
    print(f"Uploaded {n} files")

    run(ssh, f"chown -R www-data:www-data {REMOTE_WEB}")
    run(ssh, "nginx -t && systemctl reload nginx")

    # Try certbot if available / install
    code, _, _ = run(
        ssh,
        "export DEBIAN_FRONTEND=noninteractive; apt-get install -y certbot python3-certbot-nginx",
        check=False,
    )
    # Non-interactive certbot — may fail if Cloudflare orange cloud blocks ACME or DNS not ready
    code, out, err = run(
        ssh,
        f"certbot --nginx -d {DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email --redirect",
        check=False,
    )
    if code != 0:
        print("Certbot não concluiu (comum com proxy Cloudflare). Site em HTTP:80; SSL via Cloudflare ou Origin Cert.")
    else:
        print("Certbot OK — HTTPS ativo no origin.")

    # Smoke tests from VPS
    run(ssh, f"curl -sI -H 'Host: {DOMAIN}' http://127.0.0.1/ | head -n 15", check=False)
    run(ssh, f"test -f {REMOTE_WEB}/index.html && echo INDEX_OK", check=False)

    ssh.close()
    print("\nDeploy concluído.")
    print(f"Teste: http://{DOMAIN} e https://{DOMAIN}")
    print("Lembrete: Supabase Auth → Site URL / Redirect URLs com https://" + DOMAIN)


if __name__ == "__main__":
    main()
