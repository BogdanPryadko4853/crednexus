#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root'; exit 1; }
source /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 26.04 && $VERSION_CODENAME == resolute ]] || {
    echo 'This provisioner is reviewed for Ubuntu 26.04 resolute only'; exit 1;
}
[[ $(dpkg --print-architecture) == amd64 ]] || exit 1
export DEBIAN_FRONTEND=noninteractive
apt-get -o DPkg::Lock::Timeout=600 update
apt-get -o DPkg::Lock::Timeout=600 install -y ca-certificates curl gnupg git sudo jq restic
install -m 0755 -d /etc/apt/keyrings
curl --fail --silent --show-error --location --retry 3 \
    https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod 0644 /etc/apt/keyrings/docker.asc
printf '%s\n' 'Types: deb' 'URIs: https://download.docker.com/linux/ubuntu' \
    'Suites: resolute' 'Components: stable' 'Architectures: amd64' \
    'Signed-By: /etc/apt/keyrings/docker.asc' > /etc/apt/sources.list.d/docker.sources
curl --fail --silent --show-error --location --retry 3 \
    https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl --fail --silent --show-error --location --retry 3 \
    https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    -o /etc/apt/sources.list.d/caddy-stable.list
chmod 0644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
apt-get -o DPkg::Lock::Timeout=600 update
apt-get -o DPkg::Lock::Timeout=600 install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin caddy
install -d -m 0700 /etc/crednexus /var/backups/crednexus
install -d -m 0755 /opt/crednexus/releases /var/lib/crednexus
if [[ ! -f /etc/docker/daemon.json ]]; then
    printf '%s\n' '{"log-driver":"local","log-opts":{"max-size":"10m","max-file":"3"}}' > /etc/docker/daemon.json
    systemctl restart docker
fi
systemctl enable --now docker caddy
if ! id deploy >/dev/null 2>&1; then
    useradd --create-home --shell /bin/bash deploy
fi
install -d -m 0700 -o deploy -g deploy /home/deploy/.ssh
# Input keys are public; never copy a private SSH key onto the VPS.
touch /home/deploy/.ssh/authorized_keys
if ! grep -Fq "$(cat "$1")" /home/deploy/.ssh/authorized_keys; then
    cat "$1" >> /home/deploy/.ssh/authorized_keys
fi
if ! grep -Fq "$(cat "$2")" /home/deploy/.ssh/authorized_keys; then
    printf 'restrict,command="/usr/local/bin/crednexus-deploy-gateway" %s\n' "$(cat "$2")" >> /home/deploy/.ssh/authorized_keys
fi
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 0600 /home/deploy/.ssh/authorized_keys
# Deliberately not in the docker group (which is effectively unrestricted root).
printf '%s\n' 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/crednexus-release' > /etc/sudoers.d/crednexus-deploy
chmod 0440 /etc/sudoers.d/crednexus-deploy
visudo -cf /etc/sudoers.d/crednexus-deploy
docker version --format '{{.Server.Version}}'
docker compose version
caddy version
echo 'Provisioned. Existing root SSH and firewall are unchanged.'
