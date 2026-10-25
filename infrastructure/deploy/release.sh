#!/usr/bin/env bash
# Installed root-owned, callable by deploy only through a restricted SSH gateway.
set -Eeuo pipefail
umask 077
[[ $EUID == 0 && $# == 2 && $1 =~ ^[0-9a-f]{40}$ && $2 =~ ^[1-9][0-9]{0,15}$ ]] || exit 64
sha=$1
run_id=$2
exec 9>/run/lock/crednexus-operation.lock
flock -w 1200 9
state=/var/lib/crednexus
last_run=$(cat "$state/last-run" 2>/dev/null || echo 0)
(( run_id >= last_run )) || { echo 'Refusing older workflow run'; exit 1; }
free_kb=$(df --output=avail /opt/crednexus | tail -1 | tr -d ' ')
(( free_kb >= 4194304 )) || { echo 'Less than 4 GiB free; refusing deployment'; exit 1; }
repo=/opt/crednexus/repository
if [[ ! -d "$repo/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git clone --filter=blob:none --no-checkout \
        https://github.com/BogdanPryadko4853/crednexus.git "$repo"
fi
GIT_TERMINAL_PROMPT=0 git -C "$repo" fetch origin develop
[[ $(git -C "$repo" rev-parse origin/develop) == "$sha" ]] || {
    echo 'Requested SHA is no longer the head of develop'; exit 1;
}
release=/opt/crednexus/releases/$sha
install -d -m 0700 "$release"
git -C "$repo" archive "$sha" compose.prod.yaml infrastructure | tar -x -C "$release"
printf 'IMAGE_NAMESPACE=ghcr.io/bogdanpryadko4853\nIMAGE_TAG=%s\n' "$sha" > "$release/images.env"
compose=(docker compose --env-file /etc/crednexus/production.env --env-file "$release/images.env" -f "$release/compose.prod.yaml")
"${compose[@]}" config --quiet
docker_config=$(mktemp -d /run/crednexus-docker.XXXXXX)
export DOCKER_CONFIG=$docker_config
trap 'rm -f "$docker_config/config.json"; rmdir "$docker_config"' EXIT
# The short-lived GITHUB_TOKEN is supplied on stdin, never as an argument or env file.
IFS= read -r registry_user
[[ $registry_user =~ ^[A-Za-z0-9-]{1,39}$ ]] || exit 64
docker login ghcr.io --username "$registry_user" --password-stdin >/dev/null
"${compose[@]}" pull
for component in backend frontend ml minio; do
    image="ghcr.io/bogdanpryadko4853/crednexus-$component:$sha"
    revision=$(docker image inspect "$image" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')
    [[ $revision == "$sha" ]] || { echo "Image revision mismatch: $component"; exit 1; }
done
# Recheck after potentially long pulls, not just before them.
GIT_TERMINAL_PROMPT=0 git -C "$repo" fetch origin develop
[[ $(git -C "$repo" rev-parse origin/develop) == "$sha" ]] || {
    echo 'A newer push arrived while pulling images; deployment skipped'; exit 1;
}
if [[ -L /opt/crednexus/current ]]; then
    /usr/local/sbin/crednexus-backup --already-locked
fi
# Retain a high-water mark even if applying this release fails.
printf '%s\n' "$run_id" > "$state/last-run"
if ! "${compose[@]}" up -d --no-build --wait --wait-timeout 300; then
    "${compose[@]}" ps --all
    echo 'Deployment failed. Previous release pointer and backups retained; no DB downgrade attempted.' >&2
    exit 1
fi
curl --fail --silent --show-error --retry 5 --retry-delay 3 \
    https://app.155.212.216.26.sslip.io/healthz >/dev/null
curl --fail --silent --show-error --retry 5 --retry-delay 3 \
    https://auth.155.212.216.26.sslip.io/realms/crednexus/.well-known/openid-configuration >/dev/null
if [[ -L /opt/crednexus/current ]]; then
    ln -sfn "$(readlink -f /opt/crednexus/current)" /opt/crednexus/previous
fi
ln -sfn "$release" /opt/crednexus/current
printf '%s\n' "$sha" > "$state/last-sha"
echo "Deployed $sha successfully"
