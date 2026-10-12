#!/usr/bin/env bash
# Update Freegma / Penpot safely.
#
#   scripts/update.sh <penpot-version> [--freegma <version>] [--yes] [--skip-backup]
#   e.g. scripts/update.sh 2.19.0
#
# Steps: pre-flight (images exist) -> backup -> bump versions in .env ->
#        pull -> up -> wait healthy -> smoke test.
# On failure: restore the previous versions AND the pre-update backup
# (Penpot runs DB migrations on start, so the old version needs the old DB).
. "$(dirname "$0")/lib.sh"
require_env_file

NEW_PENPOT="" NEW_FREEGMA="" YES=0 SKIP_BACKUP=0
while [ $# -gt 0 ]; do
    case "$1" in
        --freegma) NEW_FREEGMA="$2"; shift 2 ;;
        --yes|-y) YES=1; shift ;;
        --skip-backup) SKIP_BACKUP=1; shift ;;
        -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
        *) NEW_PENPOT="$1"; shift ;;
    esac
done

OLD_PENPOT="$(env_get PENPOT_VERSION)"
OLD_FREEGMA="$(env_get FREEGMA_VERSION)"
NEW_PENPOT="${NEW_PENPOT:-$OLD_PENPOT}"
NEW_FREEGMA="${NEW_FREEGMA:-$OLD_FREEGMA}"
FREEGMA_IMAGE="$(env_get FREEGMA_IMAGE ghcr.io/julianhintermann-cmd/freegma)"

case "$NEW_PENPOT" in
    latest|main|develop|*RC*|*rc*|*beta*) die "refusing non-release Penpot tag '$NEW_PENPOT' - pin an exact version (e.g. 2.18.3)" ;;
esac

info "Update plan"
echo "    Penpot : $OLD_PENPOT -> $NEW_PENPOT"
echo "    Freegma: $OLD_FREEGMA -> $NEW_FREEGMA"
echo "    Release notes: https://github.com/penpot/penpot/releases/tag/$NEW_PENPOT"

info "Pre-flight: checking that the images exist"
for img in frontend backend exporter mcp; do
    docker manifest inspect "penpotapp/$img:$NEW_PENPOT" >/dev/null 2>&1 \
        || die "image penpotapp/$img:$NEW_PENPOT not found"
done
if [ "$NEW_FREEGMA" != "$OLD_FREEGMA" ]; then
    docker manifest inspect "$FREEGMA_IMAGE:$NEW_FREEGMA" >/dev/null 2>&1 \
        || die "image $FREEGMA_IMAGE:$NEW_FREEGMA not found"
fi
ok "images available"

if [ "$YES" != 1 ]; then
    [ -t 0 ] || die "use --yes for non-interactive updates"
    read -r -p "Proceed? [y/N] " a; [ "$a" = y ] || [ "$a" = Y ] || die "aborted"
fi

BACKUP_PATH=""
if [ "$SKIP_BACKUP" != 1 ]; then
    "$FREEGMA_ROOT/scripts/backup.sh"
    BACKUP_DIR="$(env_get BACKUP_DIR ./backups)"
    case "$BACKUP_DIR" in /*) ;; *) BACKUP_DIR="$FREEGMA_ROOT/${BACKUP_DIR#./}" ;; esac
    BACKUP_PATH="$(ls -1d "$BACKUP_DIR"/daily/freegma-* | sort | tail -n1)"
    ok "pre-update backup: $BACKUP_PATH"
else
    warn "skipping backup - rollback of the database will not be possible"
fi

rollback() {
    warn "update failed - rolling back to Penpot $OLD_PENPOT / Freegma $OLD_FREEGMA"
    env_set PENPOT_VERSION "$OLD_PENPOT"
    env_set FREEGMA_VERSION "$OLD_FREEGMA"
    if [ -n "$BACKUP_PATH" ]; then
        "$FREEGMA_ROOT/scripts/restore.sh" "$BACKUP_PATH" --yes
    else
        dc up -d && wait_healthy 420 || true
    fi
    die "update rolled back. Inspect the logs above / 'make logs'."
}

info "Switching versions"
env_set PENPOT_VERSION "$NEW_PENPOT"
env_set FREEGMA_VERSION "$NEW_FREEGMA"

info "Pulling images"
dc pull --ignore-pull-failures || rollback
# Build locally only when the Freegma image cannot be pulled (e.g. dev tags).
docker image inspect "$FREEGMA_IMAGE:$NEW_FREEGMA" >/dev/null 2>&1 || dc build freegma || rollback

info "Starting new version"
dc up -d --remove-orphans || rollback
wait_healthy 600 || rollback
ok "all services healthy"

info "Smoke test"
FREEGMA_SMOKE_BROWSER="${FREEGMA_SMOKE_BROWSER:-0}" dc run --rm tools smoke || rollback

# Lets you rehearse the rollback path: FREEGMA_UPDATE_SIMULATE_FAILURE=1 make update ...
if [ "${FREEGMA_UPDATE_SIMULATE_FAILURE:-0}" = 1 ]; then
    warn "FREEGMA_UPDATE_SIMULATE_FAILURE=1 - pretending the update failed"
    rollback
fi

info "Update complete: Penpot $NEW_PENPOT, Freegma $NEW_FREEGMA"
