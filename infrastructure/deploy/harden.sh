#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 ]] || exit 1
# Run only AFTER verifying a separate SSH session as deploy with public-key auth.
install -d -m 0755 /etc/ssh/sshd_config.d
printf '%s\n' 'PubkeyAuthentication yes' 'PasswordAuthentication no' \
    'KbdInteractiveAuthentication no' 'PermitRootLogin prohibit-password' \
    > /etc/ssh/sshd_config.d/00-crednexus.conf
sshd -t
systemctl reload ssh
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose
