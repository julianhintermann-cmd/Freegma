#!/usr/bin/env bash
# Create .env from .env.example with fresh secrets.
#
#   scripts/init.sh [--domain freegma.home.arpa] [--https-port 443] [--http-only] [--force]
#
# --http-only : no Caddy; Freegma listens on FREEGMA_HTTP_PORT (for use behind
#               an existing reverse proxy or for a quick local test).
. "$(dirname "$0")/lib.sh"

DOMAIN="" HTTPS_PORT="" HTTP_ONLY=0 FORCE=0
while [ $# -gt 0 ]; do
    case "$1" in
        --domain) DOMAIN="$2"; shift 2 ;;
        --https-port) HTTPS_PORT="$2"; shift 2 ;;
        --http-only) HTTP_ONLY=1; shift ;;
        --force) FORCE=1; shift ;;
        -h|--help) sed -n '2,9p' "$FREEGMA_ROOT/scripts/init.sh"; exit 0 ;;
        *) die "unknown option: $1" ;;
    esac
done

if [ -f .env ] && [ "$FORCE" != 1 ]; then
    die ".env already exists (use --force to overwrite; your secrets would change!)"
fi

cp .env.example .env
chmod 600 .env

env_set PENPOT_SECRET_KEY "$(random_secret 64)"
env_set POSTGRES_PASSWORD "$(random_secret 32)"
ok "generated PENPOT_SECRET_KEY and POSTGRES_PASSWORD"

if [ -n "$DOMAIN" ]; then
    env_set FREEGMA_DOMAIN "$DOMAIN"
fi
DOMAIN="$(env_get FREEGMA_DOMAIN)"
[ -n "$HTTPS_PORT" ] && env_set FREEGMA_HTTPS_PORT "$HTTPS_PORT"

if [ "$HTTP_ONLY" = 1 ]; then
    env_set COMPOSE_PROFILES ""
    env_set FREEGMA_HTTP_BIND "0.0.0.0"
    port="$(env_get FREEGMA_HTTP_PORT 9001)"
    env_set FREEGMA_PUBLIC_URI "http://${DOMAIN}:${port}"
else
    port="$(env_get FREEGMA_HTTPS_PORT 443)"
    if [ "$port" = 443 ]; then
        env_set FREEGMA_PUBLIC_URI "https://${DOMAIN}"
    else
        env_set FREEGMA_PUBLIC_URI "https://${DOMAIN}:${port}"
    fi
fi

# Hosts with IPv6 disabled in the kernel (common on NAS systems) need this.
if [ ! -e /proc/net/if_inet6 ]; then
    env_set PENPOT_DISABLE_IPV6_LISTEN true
    ok "IPv6 not available on this host -> PENPOT_DISABLE_IPV6_LISTEN=true"
fi

ok "wrote .env (public URL: $(env_get FREEGMA_PUBLIC_URI))"
echo
echo "Next steps:"
echo "  1. review .env (domain, ports, backup dir)"
echo "  2. make up"
echo "  3. make admin EMAIL=you@example.com NAME='Your Name'"
