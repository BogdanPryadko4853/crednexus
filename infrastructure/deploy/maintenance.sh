#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 ]] || exit 1
exec 9>/run/lock/crednexus-operation.lock
flock -w 1200 9
# Build cache only: no containers, images or volumes are removed here.
docker builder prune --force --filter until=168h --keep-storage 1GB
current_tag=''
previous_tag=''
[[ ! -f /opt/crednexus/current/images.env ]] || current_tag=$(sed -n 's/^IMAGE_TAG=//p' /opt/crednexus/current/images.env)
[[ ! -f /opt/crednexus/previous/images.env ]] || previous_tag=$(sed -n 's/^IMAGE_TAG=//p' /opt/crednexus/previous/images.env)
# Limit cleanup to this project's GHCR references; retain current and previous releases.
while read -r reference; do
    [[ -n $reference ]] || continue
    tag=${reference##*:}
    [[ $tag != "$current_tag" && $tag != "$previous_tag" ]] || continue
    docker image rm --no-prune "$reference" || true
done < <(docker image ls --format '{{.Repository}}:{{.Tag}}' \
    --filter 'reference=ghcr.io/bogdanpryadko4853/crednexus-*:*')
free_kb=$(df --output=avail /opt/crednexus | tail -1 | tr -d ' ')
if (( free_kb < 4194304 )); then
    logger -p daemon.err -t crednexus 'Disk space below 4 GiB; new deployments will be blocked'
    exit 1
fi
df -h /opt/crednexus
