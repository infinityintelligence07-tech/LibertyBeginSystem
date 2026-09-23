#!/usr/bin/env python3
import os
import sys
from pathlib import Path

import paramiko

HOST, PORT, USER = "187.77.195.178", 22, "root"
PASSWORD = os.environ["VPS_PASSWORD"]
REMOTE_WEB = "/var/www/libertybegin"
DOMAIN = "libertybegin.iamcontrol.com.br"
dist = Path(r"c:\Users\Usuario\Desktop\libertybegin\dist")


def run(ssh, cmd, check=True):
    print("$", cmd)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    if check and code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")
    return code, out, err


def sftp_mkdirs(sftp, remote):
    parts = remote.strip("/").split("/")
    cur = ""
    for p in parts:
        cur += "/" + p
        try:
            sftp.stat(cur)
        except FileNotFoundError:
            sftp.mkdir(cur)


def upload_dir(sftp, local, remote):
    count = 0
    sftp_mkdirs(sftp, remote)
    for root, _dirs, files in os.walk(local):
        rel = Path(root).relative_to(local)
        rdir = remote if str(rel) == "." else f"{remote}/{rel.as_posix()}"
        try:
            sftp.stat(rdir)
        except FileNotFoundError:
            sftp.mkdir(rdir)
        for f in files:
            sftp.put(str(Path(root) / f), f"{rdir}/{f}")
            count += 1
    return count


def main():
    if not dist.is_dir():
        raise SystemExit("dist missing")

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
    run(ssh, f"mkdir -p {REMOTE_WEB}")
    run(ssh, f"find {REMOTE_WEB} -mindepth 1 -delete", check=False)
    sftp = ssh.open_sftp()
    n = upload_dir(sftp, dist, REMOTE_WEB)
    sftp.close()
    print("uploaded", n, "files")
    run(ssh, f"chown -R www-data:www-data {REMOTE_WEB}")
    run(ssh, "nginx -t && systemctl reload nginx")
    run(ssh, f"ls -la {REMOTE_WEB} | head")
    run(ssh, f"head -c 250 {REMOTE_WEB}/index.html; echo")
    run(ssh, f"curl -sI -H 'Host: {DOMAIN}' http://127.0.0.1/ | head -n 20")
    run(
        ssh,
        f"curl -s -H 'Host: {DOMAIN}' http://127.0.0.1/ | head -c 400; echo",
    )
    ssh.close()
    print("DONE")


if __name__ == "__main__":
    main()
