#!/usr/bin/env python3
"""Clone LibertyBegin on VPS and install git-based deploy script."""
import os
import sys
from pathlib import Path

import paramiko

HOST, PORT, USER = "187.77.195.178", 22, "root"
PASSWORD = os.environ["VPS_PASSWORD"]
REPO = "https://github.com/infinityintelligence07-tech/LibertyBeginSystem.git"
SRC = "/opt/libertybegin"
WEB = "/var/www/libertybegin"
LOCAL_ENV = Path(r"c:\Users\Usuario\Desktop\libertybegin\.env")
LOCAL_DEPLOY = Path(r"c:\Users\Usuario\Desktop\libertybegin\deploy\deploy-vps.sh")


def run(ssh, cmd, check=True):
    print("$", cmd[:220])
    _, stdout, _stderr = ssh.exec_command(cmd, get_pty=True)
    out = stdout.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        safe = out.rstrip()[-6000:].encode("ascii", "replace").decode("ascii")
        print(safe)
    print("exit", code)
    if check and code != 0:
        raise RuntimeError(cmd)
    return code, out


def main():
    env_text = LOCAL_ENV.read_text(encoding="utf-8") if LOCAL_ENV.exists() else ""
    deploy_text = LOCAL_DEPLOY.read_text(encoding="utf-8")

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

    run(
        ssh,
        "export DEBIAN_FRONTEND=noninteractive; "
        "command -v git >/dev/null || apt-get install -y git; "
        "command -v rsync >/dev/null || apt-get install -y rsync; "
        "if ! command -v node >/dev/null; then "
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; "
        "apt-get install -y nodejs; fi; "
        "node -v; npm -v",
    )

    code, _ = run(ssh, f"test -d {SRC}/.git", check=False)
    if code != 0:
        run(ssh, f"rm -rf {SRC} && git clone {REPO} {SRC}")
    else:
        run(ssh, f"cd {SRC} && git fetch origin && git reset --hard origin/main")

    sftp = ssh.open_sftp()
    with sftp.file(f"{SRC}/.env", "w") as f:
        f.write(env_text)
    with sftp.file(f"{SRC}/deploy-vps.sh", "w") as f:
        f.write(deploy_text)
    sftp.close()
    run(ssh, f"chmod +x {SRC}/deploy-vps.sh")
    run(ssh, f"bash {SRC}/deploy-vps.sh")
    run(ssh, f"ls -la {WEB} | head")
    run(ssh, f"test -f {WEB}/index.html && echo WEB_OK")
    run(
        ssh,
        "curl -skI -H 'Host: begin.libertymentoria.com.br' https://127.0.0.1/ | head -n 10",
    )
    ssh.close()
    print("ALL DONE")


if __name__ == "__main__":
    main()
