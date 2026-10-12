#!/usr/bin/env bash
# Restore a Freegma backup created by scripts/backup.sh.
#
#   scripts/restore.sh <backup-dir> [--with-env] [--yes]
#
# Replaces the current database and assets with the backup's content.
# --with-env : also restore .env from the backup (needed on a new machine:
#              PENPOT_SECRET_KEY signs sessions and MCP keys).
# Works on a running stack, a stopped one, or a completely fresh install
# (run `make init` first, or use --with-env).
. "$(dirname "$0")/lib.sh"

SRC="" WITH_ENV=0 YES=0
while [ $# -gt 0 ]; do
    case "$1" in
        --with-env) WITH_ENV=1; shift ;;
        --yes|-y) YES=1; shift ;;
        -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
        *) SRC="$1"; shift ;;
    esac
done
[ -n "$SRC" ] || die "usage: $0 <backup-dir> [--with-env] [--yes]"
[ -d "$SRC" ] || die "backup not found: $SRC"
SRC="$(cd "$SRC" && pwd)"
for f in database.dump assets.tar.gz MANIFEST; do
    [ -f "$SRC/$f" ] || die "incomplete backup: $SRC/$f missing"
done

info "Verifying checksums"
(cd "$SRC" && sha256sum -c --quiet SHA256SUMS) || die "checksum mismatch - backup is corrupt"
ok "checksums match"
sed 's/^/    /' "$SRC/MANIFEST"

if [ "$WITH_ENV" = 1 ]; then
    if [ -f .env ]; then cp .env ".env.before-restore.$(date +%s)"; fi
    cp "$SRC/env" .env && chmod 600 .env
    ok ".env restored from backup (previous one saved as .env.before-restore.*)"
fi
require_env_file

backup_version="$(grep '^penpot_version=' "$SRC/MANIFEST" | cut -d= -f2)"
current_version="$(env_get PENPOT_VERSION)"
if [ -n "$backup_version" ] && [ "$backup_version" != "$current_version" ]; then
    warn "backup was taken with Penpot $backup_version, .env uses $current_version."
    warn "Restoring into an older Penpot than the backup is not supported; newer is fine (migrations run on start)."
fi

if [ "$YES" != 1 ]; then
    [ -t 0 ] || die "refusing to restore without --yes (no TTY)"
    read -r -p "This REPLACES all Freegma data with the backup. Type 'restore' to continue: " answer
    [ "$answer" = restore ] || die "aborted"
fi

PG_USER="$(env_get POSTGRES_USER penpot)"
PG_DB="$(env_get POSTGRES_DB penpot)"

info "Stopping application services"
dc stop freegma caddy penpot-frontend penpot-backend penpot-exporter penpot-mcp >/dev/null 2>&1 || true

info "Starting database and cache"
dc up -d penpot-postgres penpot-valkey
for _ in $(seq 1 60); do
    dc exec -T penpot-postgres pg_isready -U "$PG_USER" >/dev/null 2>&1 && break
    sleep 2
done
dc exec -T penpot-postgres pg_isready -U "$PG_USER" >/dev/null || die "postgres did not become ready"

info "Restoring database"
dc exec -T penpot-postgres psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d postgres -q \
    -c "DROP DATABASE IF EXISTS \"$PG_DB\" WITH (FORCE);" \
    -c "CREATE DATABASE \"$PG_DB\" OWNER \"$PG_USER\";"
dc exec -T penpot-postgres pg_restore -U "$PG_USER" -d "$PG_DB" --no-owner --role="$PG_USER" --exit-on-error \
    < "$SRC/database.dump"
ok "database restored"

info "Restoring assets"
dc run --rm --no-deps -T --entrypoint bash penpot-backend \
    -c 'find /opt/data/assets -mindepth 1 -delete && tar -C /opt/data/assets -xzf -' \
    < "$SRC/assets.tar.gz"
ok "assets restored"

if [ -f "$SRC/caddy-data.tar.gz" ]; then
    info "Restoring Caddy certificates / internal CA"
    dc stop caddy >/dev/null 2>&1 || true
    dc --profile https run --rm --no-deps -T --entrypoint sh caddy \
        -c 'rm -rf /data/caddy && tar -C /data -xzf -' < "$SRC/caddy-data.tar.gz"
    ok "caddy data restored"
fi

info "Clearing cache (sessions/notifications state)"
dc exec -T penpot-valkey valkey-cli FLUSHALL >/dev/null
ok "cache cleared"

info "Starting Freegma"
dc up -d
if wait_healthy 420; then
    ok "all services healthy"
else
    die "services did not become healthy - check 'make logs'"
fi
info "Restore complete"
