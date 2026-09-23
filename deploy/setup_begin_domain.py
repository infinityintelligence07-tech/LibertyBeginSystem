#!/usr/bin/env python3
"""Upload nginx conf and issue cert for begin.libertymentoria.com.br"""
import os
import sys
from pathlib import Path

import paramiko

HOST, PORT, USER = "187.77.195.178", 22, "root"
PASSWORD = os.environ["VPS_PASSWORD"]
LOCAL_CONF = Path(__file__).with_name("nginx-libertybegin.conf")
REMOTE_CONF = "/etc/nginx/sites-available/libertybegin"
DOMAIN_NEW = "begin.libertymentoria.com.br"
DOMAIN_OLD = "libertybegin.iamcontrol.com.br"
ACC = "219c24aa6f55cc81c546f9fc3e2c0b2e"


def run(ssh, cmd, check=True):
    print("$", cmd[:200])
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
    out = stdout.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip()[-4000:])
    print("exit", code)
    if check and code != 0:
        raise RuntimeError(cmd)
    return code, out


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        HOST,
        port=PORT,
        username=USER,
        password=PASSWORD,
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )

    sftp = ssh.open_sftp()
    sftp.put(str(LOCAL_CONF), REMOTE_CONF)
    sftp.close()
    print("uploaded nginx conf")

    run(ssh, "ln -sfn /etc/nginx/sites-available/libertybegin /etc/nginx/sites-enabled/libertybegin")
    run(ssh, "nginx -t && systemctl reload nginx")

    # New domain cert
    code, out = run(
        ssh,
        f"certbot --nginx -d {DOMAIN_NEW} --non-interactive --agree-tos --redirect --account {ACC} 2>&1",
        check=False,
    )
    if code != 0:
        print("WARN: cert for new domain failed; trying expand with both names")

    # Keep old domain on same cert / expand
    run(
        ssh,
        f"certbot --nginx -d {DOMAIN_NEW} -d {DOMAIN_OLD} --non-interactive --agree-tos --redirect --account {ACC} --expand 2>&1",
        check=False,
    )

    run(ssh, f"grep -nE 'listen|ssl_certificate|server_name' {REMOTE_CONF}")
    run(ssh, f"curl -sI -H 'Host: {DOMAIN_NEW}' http://127.0.0.1/ | head -n 12")
    run(ssh, f"curl -skI -H 'Host: {DOMAIN_NEW}' https://127.0.0.1/ | head -n 15")
    run(
        ssh,
        f"curl -sk -H 'Host: {DOMAIN_NEW}' https://127.0.0.1/ | head -c 220; echo",
    )
    ssh.close()
    print("DONE")


if __name__ == "__main__":
    main()
