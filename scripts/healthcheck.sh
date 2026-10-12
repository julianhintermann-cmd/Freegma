#!/usr/bin/env bash
# Freegma health check - for humans, cron, Uptime Kuma, Hermes & co.
#
#   scripts/healthcheck.sh            # human readable, exit 0 = healthy
#   scripts/healthcheck.sh --json     # one JSON object (for monitoring)
#   scripts/healthcheck.sh --wait 300 # wait up to 300 s for healthy
#
# Exit codes: 0 healthy, 1 degraded/unhealthy, 2 not configured
. "$(dirname "$0")/lib.sh"
[ -f .env ] || { echo "not configured (.env missing)"; exit 2; }

JSON=0 WAIT=0
while [ $# -gt 0 ]; do
    case "$1" in
        --json) JSON=1; shift ;;
        --wait) WAIT="$2"; shift 2 ;;
        *) die "unknown option $1" ;;
    esac
done

if [ "$WAIT" -gt 0 ]; then wait_healthy "$WAIT" >/dev/null 2>&1 || true; fi

PUBLIC_URI="$(env_get FREEGMA_PUBLIC_URI)"
HTTP_PORT="$(env_get FREEGMA_HTTP_PORT 9001)"
HTTP_BIND="$(env_get FREEGMA_HTTP_BIND 127.0.0.1)"
case "$HTTP_BIND" in ""|0.0.0.0|127.0.0.1|"::") HTTP_BIND=127.0.0.1 ;; esac
LOCAL="http://${HTTP_BIND}:${HTTP_PORT}"
EXPECTED="caddy freegma penpot-frontend penpot-backend penpot-exporter penpot-mcp penpot-postgres penpot-valkey"
case ",$(env_get COMPOSE_PROFILES)," in *,https,*) ;; *) EXPECTED="${EXPECTED#caddy }" ;; esac

status=0
declare -A svc_state
for s in $EXPECTED; do
    st="$(dc ps --format '{{.State}}/{{.Health}}' "$s" 2>/dev/null | head -n1)"
    st="${st%/}"
    [ -n "$st" ] || st="missing"
    svc_state[$s]="$st"
    case "$st" in running/healthy|running) ;; *) status=1 ;; esac
done

http_code() {
    local code
    code="$(curl --noproxy '*' -ks -o /dev/null -m 10 -w '%{http_code}' "$1" 2>/dev/null || true)"
    echo "${code:-000}"
}
c_proxy="$(http_code "$LOCAL/freegma/healthz")"
c_ready="$(http_code "$LOCAL/readyz")"
c_public="$(http_code "$PUBLIC_URI/freegma/healthz")"
[ "$c_proxy" = 200 ] || status=1
[ "$c_ready" = 200 ] || status=1
# The public URL may not resolve on the host itself; report it, don't fail on it.

disk="$(df -P "$FREEGMA_ROOT" | awk 'NR==2 {print $5}')"
backup_dir="$(env_get BACKUP_DIR ./backups)"
newest="$(ls -1d "$backup_dir"/daily/freegma-* 2>/dev/null | sort | tail -n1 || true)"
last_backup=""
[ -n "$newest" ] && last_backup="$(basename "$newest")"

if [ "$JSON" = 1 ]; then
    printf '{"status":"%s","penpot_version":"%s","freegma_version":"%s","services":{' \
        "$([ $status = 0 ] && echo healthy || echo unhealthy)" "$(env_get PENPOT_VERSION)" "$(env_get FREEGMA_VERSION)"
    first=1
    for s in $EXPECTED; do
        [ $first = 1 ] || printf ','; first=0
        printf '"%s":"%s"' "$s" "${svc_state[$s]}"
    done
    printf '},"http":{"proxy":%s,"backend":%s,"public":%s},"disk_used":"%s","last_backup":"%s"}\n' \
        "$((10#$c_proxy))" "$((10#$c_ready))" "$((10#$c_public))" "$disk" "${last_backup:-none}"
else
    echo "Freegma $(env_get FREEGMA_VERSION) / Penpot $(env_get PENPOT_VERSION)"
    for s in $EXPECTED; do printf '  %-16s %s\n' "$s" "${svc_state[$s]}"; done
    printf '  %-16s %s\n' "proxy" "$c_proxy ($LOCAL/freegma/healthz)"
    printf '  %-16s %s\n' "backend" "$c_ready ($LOCAL/readyz)"
    printf '  %-16s %s\n' "public URL" "$c_public ($PUBLIC_URI)"
    printf '  %-16s %s\n' "disk used" "$disk"
    printf '  %-16s %s\n' "last backup" "${last_backup:-none}"
    echo "  => $([ $status = 0 ] && echo HEALTHY || echo UNHEALTHY)"
fi
exit $status
