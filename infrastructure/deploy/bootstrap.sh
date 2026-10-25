#!/usr/bin/env bash
# Initial deployment from an explicitly transferred snapshot, before the first CI push.
set -Eeuo pipefail
umask 077
[[ $EUID == 0 && $# == 1 && -f $1 ]] || exit 64
archive=$(readlink -f "$1")
snapshot=$(sha256sum "$archive" | cut -c 1-12)
release=/opt/crednexus/releases/bootstrap-$snapshot
install -d -m 0700 "$release"
tar --warning=no-unknown-keyword --exclude='._*' -xzf "$archive" -C "$release"
# A file-list archive may omit directory entries; extraction under umask 077 then
# creates implicit 0700 parents. Match a Git checkout in the public build context.
find "$release" -mindepth 1 -type d -exec chmod 0755 {} +
find "$release/ml-service/models" -type f -exec chmod 0644 {} +
if [[ ! -f /etc/crednexus/production.env ]]; then
    {
        printf '%s\n' 'POSTGRES_DB=crednexus' 'POSTGRES_USER=crednexus' \
            'KEYCLOAK_ADMIN_USERNAME=platform-admin' 'MINIO_ROOT_USER=crednexus-storage' 'MINIO_BUCKET=crednexus-documents'
        for key in POSTGRES_PASSWORD KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD \
            KEYCLOAK_DEMO_ADMIN_PASSWORD KEYCLOAK_DEMO_EMPLOYEE_PASSWORD KEYCLOAK_DEMO_CLIENT_PASSWORD MINIO_ROOT_PASSWORD; do
            printf '%s=%s\n' "$key" "$(openssl rand -hex 32)"
        done
    } > /etc/crednexus/production.env
    chmod 0600 /etc/crednexus/production.env
fi
if [[ ! -f /etc/crednexus/restic-password ]]; then
    openssl rand -hex 32 > /etc/crednexus/restic-password
    chmod 0600 /etc/crednexus/restic-password
fi
if [[ ! -f /etc/crednexus/backup.env ]]; then
    printf '%s\n' 'RESTIC_REPOSITORY=/var/backups/crednexus/restic' \
        'RESTIC_PASSWORD_FILE=/etc/crednexus/restic-password' > /etc/crednexus/backup.env
fi
install -m 0755 "$release/infrastructure/deploy/release.sh" /usr/local/sbin/crednexus-release
install -m 0755 "$release/infrastructure/deploy/ssh-gateway.sh" /usr/local/bin/crednexus-deploy-gateway
install -m 0755 "$release/infrastructure/deploy/backup.sh" /usr/local/sbin/crednexus-backup
install -m 0755 "$release/infrastructure/deploy/maintenance.sh" /usr/local/sbin/crednexus-maintenance
install -m 0644 "$release/infrastructure/deploy/crednexus-backup.service" "$release/infrastructure/deploy/crednexus-backup.timer" \
    "$release/infrastructure/deploy/crednexus-maintenance.service" "$release/infrastructure/deploy/crednexus-maintenance.timer" /etc/systemd/system/
install -d -o caddy -g caddy -m 0750 /var/log/caddy
install -m 0644 "$release/infrastructure/caddy/Caddyfile" /etc/caddy/Caddyfile
caddy fmt --overwrite /etc/caddy/Caddyfile
runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
install -d -m 0755 /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=200M\nSystemKeepFree=2G\n' > /etc/systemd/journald.conf.d/crednexus.conf
systemctl restart systemd-journald
printf 'IMAGE_NAMESPACE=crednexus-bootstrap\nIMAGE_TAG=snapshot-%s\n' "$snapshot" > "$release/images.env"
# Build only on this initial bootstrap; normal CI deployments pull SHA-tagged images.
build_image() {
    local component=$1 context=$2
    shift 2
    local image="crednexus-bootstrap/crednexus-$component:snapshot-$snapshot"
    if docker image inspect "$image" >/dev/null 2>&1; then
        [[ $(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}') == linux/amd64 ]] || exit 1
        echo "Using existing bootstrap image: $component ($snapshot)"
    else
        docker build "$@" -t "$image" "$release/$context"
    fi
}
build_image minio infrastructure/minio
build_image backend backend
build_image ml ml-service --target ml
build_image frontend frontend
docker compose --env-file /etc/crednexus/production.env --env-file "$release/images.env" \
    -f "$release/compose.prod.yaml" up -d --no-build --wait --wait-timeout 300
ln -sfn "$release" /opt/crednexus/current
systemctl daemon-reload
systemctl enable --now crednexus-backup.timer crednexus-maintenance.timer
echo "Initial snapshot $snapshot started. Public and business checks are still required."
