#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || exit 1
if [[ ${1:-} != --already-locked ]]; then
    exec 9>/run/lock/crednexus-operation.lock
    flock -w 1200 9
fi
set -a
source /etc/crednexus/backup.env
set +a
release=$(readlink -f /opt/crednexus/current)
compose=(docker compose --env-file /etc/crednexus/production.env --env-file "$release/images.env" -f "$release/compose.prod.yaml")
work=$(mktemp -d /run/crednexus-backup.XXXXXX)
resume() {
    "${compose[@]}" start --wait --wait-timeout 300 minio backend frontend
    rm -f "$work/postgres.sql.gz" "$work/production.env" "$work/images.env" "$work/Caddyfile" "$work/showcase-password"
    rmdir "$work"
}
trap resume EXIT
# Freeze application writes so the DB dump and object files belong to one checkpoint.
"${compose[@]}" stop -t 45 backend minio
"${compose[@]}" exec -T postgres sh -ec 'pg_dumpall -U "$POSTGRES_USER"' | gzip > "$work/postgres.sql.gz"
install -m 0600 /etc/crednexus/production.env "$work/production.env"
install -m 0600 "$release/images.env" "$work/images.env"
install -m 0600 /etc/caddy/Caddyfile "$work/Caddyfile"
if [[ -f /etc/crednexus/showcase-password ]]; then
    install -m 0600 /etc/crednexus/showcase-password "$work/showcase-password"
fi
objects=$(docker volume inspect crednexus-production-minio --format '{{.Mountpoint}}')
restic snapshots >/dev/null 2>&1 || restic init
restic backup --tag crednexus "$work" "$objects" "$release/compose.prod.yaml" "$release/infrastructure"
restic forget --tag crednexus --group-by host,tags --keep-daily 7 --keep-weekly 4 --prune
restic check
echo 'Encrypted backup complete (database, documents, configuration).'
