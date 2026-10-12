#!/usr/bin/env bash
# Back up Freegma: PostgreSQL (pg_dump, custom format) + assets volume +
# configuration (.env, branding/). Online backup - the stack keeps running.
#
#   scripts/backup.sh               # -> $BACKUP_DIR/daily/freegma-<timestamp>/
#
# Rotation: keeps BACKUP_KEEP_DAILY daily (default 7) and BACKUP_KEEP_WEEKLY
# weekly (default 4) backups. A weekly copy is made on Sundays, or whenever
# the newest weekly backup is older than 7 days.
#
# Cron (daily 03:15):
#   15 3 * * * cd /path/to/freegma && ./scripts/backup.sh >> backups/backup.log 2>&1
. "$(dirname "$0")/lib.sh"
require_env_file

BACKUP_DIR="$(env_get BACKUP_DIR ./backups)"
KEEP_DAILY="$(env_get BACKUP_KEEP_DAILY 7)"
KEEP_WEEKLY="$(env_get BACKUP_KEEP_WEEKLY 4)"
PG_USER="$(env_get POSTGRES_USER penpot)"
PG_DB="$(env_get POSTGRES_DB penpot)"

case "$BACKUP_DIR" in /*) ;; *) BACKUP_DIR="$FREEGMA_ROOT/${BACKUP_DIR#./}" ;; esac
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
chmod 700 "$BACKUP_DIR"

# Only one backup at a time.
exec 9>"$BACKUP_DIR/.lock"
if command -v flock >/dev/null 2>&1; then
    flock -n 9 || die "another backup is running"
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
NAME="freegma-$STAMP"
TMP="$BACKUP_DIR/.tmp-$NAME"
DEST="$BACKUP_DIR/daily/$NAME"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP"

[ -n "$(dc ps -q penpot-postgres 2>/dev/null)" ] || die "penpot-postgres is not running (make up)"

info "Backup $NAME -> $DEST"

# 1. Database
dc exec -T penpot-postgres pg_dump -U "$PG_USER" -d "$PG_DB" -Fc --no-owner > "$TMP/database.dump"
dc exec -T penpot-postgres pg_restore --list < "$TMP/database.dump" > /dev/null \
    || die "database dump failed verification"
ok "database ($(du -h "$TMP/database.dump" | cut -f1))"

# 2. Assets (images, fonts, thumbnails) - read through the backend container
dc exec -T penpot-backend tar -C /opt/data/assets -czf - . > "$TMP/assets.tar.gz"
gzip -t "$TMP/assets.tar.gz" || die "assets archive failed verification"
ok "assets ($(du -h "$TMP/assets.tar.gz" | cut -f1))"

# 3. Caddy's internal CA + certificates (so devices that trust the Freegma
#    root CA keep working after a restore). Only with the "https" profile.
if [ -n "$(dc ps -q caddy 2>/dev/null)" ]; then
    dc exec -T caddy tar -C /data -czf - caddy > "$TMP/caddy-data.tar.gz"
    gzip -t "$TMP/caddy-data.tar.gz" || die "caddy archive failed verification"
    ok "caddy certificates / internal CA"
fi

# 4. Configuration (contains secrets -> backup dir is chmod 700)
cp .env "$TMP/env"
chmod 600 "$TMP/env"
tar -czf "$TMP/branding.tar.gz" branding
ok "configuration (.env, branding/)"

# 5. Manifest
cat > "$TMP/MANIFEST" <<EOF
name=$NAME
created=$(date -Iseconds)
host=$(hostname)
penpot_version=$(env_get PENPOT_VERSION)
freegma_version=$(env_get FREEGMA_VERSION)
postgres_db=$PG_DB
postgres_user=$PG_USER
EOF
(cd "$TMP" && sha256sum -- * > SHA256SUMS)

mv "$TMP" "$DEST"
trap - EXIT
ok "written $DEST ($(du -sh "$DEST" | cut -f1))"

# 6. Weekly copy
newest_weekly="$(ls -1d "$BACKUP_DIR"/weekly/freegma-* 2>/dev/null | sort | tail -n1 || true)"
make_weekly=0
[ "$(date +%u)" = 7 ] && make_weekly=1
if [ -z "$newest_weekly" ] || [ -n "$(find "$newest_weekly" -maxdepth 0 -mtime +6 2>/dev/null)" ]; then
    make_weekly=1
fi
if [ "$make_weekly" = 1 ]; then
    cp -a "$DEST" "$BACKUP_DIR/weekly/$NAME"
    touch "$BACKUP_DIR/weekly/$NAME"
    ok "weekly copy created"
fi

# 7. Rotation
prune() {
    local dir="$1" keep="$2"
    ls -1d "$dir"/freegma-* 2>/dev/null | sort | head -n "-$keep" | while read -r old; do
        rm -rf "$old" && echo "  pruned $(basename "$dir")/$(basename "$old")"
    done
}
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"

info "Backup complete"
