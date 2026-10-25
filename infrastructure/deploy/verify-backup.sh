#!/usr/bin/env bash
# Restore the logical dump into a disposable, network-isolated tmpfs PostgreSQL.
# Never connects to or modifies the production database.
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || exit 1
exec 9>/run/lock/crednexus-operation.lock
flock -w 1200 9
set -a
source /etc/crednexus/backup.env
set +a
snapshot=$(restic snapshots --tag crednexus --json | jq -r 'sort_by(.time) | last | .id')
[[ $snapshot =~ ^[0-9a-f]{64}$ ]] || exit 1
dump_directory=$(restic snapshots "$snapshot" --json | jq -r '.[0].paths[] | select(startswith("/run/crednexus-backup."))')
[[ -n $dump_directory ]] || exit 1
name="crednexus-restore-check-$(date +%s)"
docker run -d --rm --name "$name" --network none \
    --tmpfs /var/lib/postgresql/data:size=512m \
    -e POSTGRES_USER=restorecheck -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
trap 'docker stop "$name" >/dev/null' EXIT
for attempt in {1..30}; do
    if docker exec "$name" pg_isready -U restorecheck >/dev/null 2>&1; then break; fi
    sleep 1
done
restic dump "$snapshot" "$dump_directory/postgres.sql.gz" | gzip -d \
    | docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U restorecheck -d postgres \
        > /var/lib/crednexus/restore-check.log 2>&1
applications=$(docker exec "$name" psql -At -U restorecheck -d crednexus -c 'SELECT count(*) FROM loan_applications')
realms=$(docker exec "$name" psql -At -U restorecheck -d keycloak -c 'SELECT count(*) FROM realm')
(( applications > 0 && realms >= 2 ))
echo "Backup SQL restored successfully into isolated scratch PostgreSQL: applications=$applications, realms=$realms"
