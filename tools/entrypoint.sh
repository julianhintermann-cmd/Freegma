#!/bin/sh
# Dispatcher for the freegma-tools image.
set -e

# Trust Caddy's internal CA when its data volume is mounted (FREEGMA_TLS=internal).
CA=/caddy-data/caddy/pki/authorities/local/root.crt
if [ -z "${NODE_EXTRA_CA_CERTS:-}" ] && [ -f "$CA" ]; then
    export NODE_EXTRA_CA_CERTS="$CA"
fi

cmd="${1:-help}"
[ $# -gt 0 ] && shift
case "$cmd" in
    smoke)     exec node /app/src/smoke-test.mjs "$@" ;;
    mcp-setup) exec node /app/src/mcp-setup.mjs "$@" ;;
    mcp-test)  exec node /app/src/mcp-test.mjs "$@" ;;
    shell)     exec /bin/bash "$@" ;;
    help|*)
        cat <<USAGE
freegma-tools <command>
  smoke       smoke test (health, branding, registration disabled, login, browser)
  mcp-setup   enable MCP for a user, create/rotate the MCP key, print client configs
  mcp-test    MCP end-to-end test (page + 393x852 frame + text + rect, read back, PNG/SVG export)
  shell       interactive shell
USAGE
        [ "$cmd" = help ] || exit 2 ;;
esac
