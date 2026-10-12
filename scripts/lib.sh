#!/usr/bin/env bash
# Shared helpers for Freegma scripts. Source it: . "$(dirname "$0")/lib.sh"

set -Eeuo pipefail

FREEGMA_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$FREEGMA_ROOT"

if [ -t 1 ]; then
    C_BOLD=$'\e[1m'; C_RED=$'\e[31m'; C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'; C_RESET=$'\e[0m'
else
    C_BOLD=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_RESET=""
fi

info() { echo "${C_BOLD}==>${C_RESET} $*"; }
ok()   { echo "  ${C_GREEN}ok${C_RESET}  $*"; }
warn() { echo "  ${C_YELLOW}warn${C_RESET} $*" >&2; }
die()  { echo "${C_RED}error:${C_RESET} $*" >&2; exit 1; }

# docker compose wrapper (always run from the repo root with its .env)
dc() { docker compose --project-directory "$FREEGMA_ROOT" "$@"; }

require_env_file() {
    [ -f "$FREEGMA_ROOT/.env" ] || die ".env not found - run 'make init' first"
}

# Read KEY from .env (without sourcing the whole file into the shell).
env_get() {
    local key="$1" default="${2:-}" line
    line="$(grep -E "^${key}=" "$FREEGMA_ROOT/.env" 2>/dev/null | tail -n1 || true)"
    if [ -n "$line" ]; then echo "${line#*=}"; else echo "$default"; fi
}

# Set KEY=VALUE in .env (adds the key if missing).
env_set() {
    local key="$1" value="$2" file="$FREEGMA_ROOT/.env" tmp
    tmp="$(mktemp)"
    if grep -qE "^${key}=" "$file"; then
        awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k {print k "=" v; next} {print}' "$file" > "$tmp"
    else
        cat "$file" > "$tmp"; echo "${key}=${value}" >> "$tmp"
    fi
    cat "$tmp" > "$file"; rm -f "$tmp"
}

random_secret() {
    # URL-safe random string of ~$1 bytes of entropy
    head -c "${1:-48}" /dev/urandom | base64 | tr -d '/+=\n' | cut -c1-"$(( ${1:-48} * 4 / 3 ))"
}

# Wait until every running service of the project is healthy (or has no healthcheck).
wait_healthy() {
    local timeout="${1:-300}" start now unhealthy
    start="$(date +%s)"
    while true; do
        unhealthy="$(dc ps --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null \
            | awk '$2!="running" || ($3!="" && $3!="healthy") {print $1"("$2($3!=""?"/"$3:"")")"}' \
            | grep -v '^tools' || true)"
        if [ -z "$unhealthy" ] && [ -n "$(dc ps -q 2>/dev/null)" ]; then
            return 0
        fi
        now="$(date +%s)"
        if [ $(( now - start )) -ge "$timeout" ]; then
            warn "not healthy after ${timeout}s: $(echo "$unhealthy" | tr '\n' ' ')"
            return 1
        fi
        sleep 5
    done
}
