---
tags: [project, homelab, design, mcp]
status: running
created: 2026-10-12
---

# Freegma

Self-hosted, branded Penpot ("Figma replacement") on the UGREEN NAS, with an MCP
server for Claude (no tool-call limits).

- **Repo:** https://github.com/julianhintermann-cmd/Freegma
- **URL:** https://freegma.home.arpa (change if you use a different `FREEGMA_DOMAIN`)
- **Login:** admin account created with `make admin` (password in the password manager)
- **MCP URL:** `https://freegma.home.arpa/mcp/stream?userToken=<FREEGMA_MCP_TOKEN from .env>`

## Versions

| Component | Version |
|---|---|
| Penpot (frontend, backend, exporter, mcp) | 2.18.3 |
| Freegma images (`freegma`, `freegma-tools`) | 1.0.0 |
| PostgreSQL | 15.19 |
| Valkey | 8.1.10 |
| Caddy | 2.11.7-alpine |
| nginx (in freegma image) | 1.30.5-alpine |
| Playwright / MCP SDK (tools) | 1.63.0 / 1.32.1 |

## Ports

| Port | Service | Exposure |
|---|---|---|
| 443 | Caddy HTTPS | LAN / Tailscale (`FREEGMA_HTTPS_BIND`) |
| 80 | Caddy redirect to HTTPS | LAN |
| 9001 | Freegma proxy (plain HTTP) | 127.0.0.1 only |
| 8025 | Mailpit UI (optional) | 127.0.0.1 only |
| internal | frontend 8080, backend 6060, exporter 6061, mcp 4401/4402, postgres 5432, valkey 6379 | Docker network `freegma_net` only |

## Paths

| What | Where |
|---|---|
| Install dir (NAS) | `/volume1/docker/freegma` |
| Config + secrets | `/volume1/docker/freegma/.env` (not in git) |
| Branding | `/volume1/docker/freegma/branding/` |
| Backups | `BACKUP_DIR` (default `./backups`, ideally another volume/share) |
| Docker volumes | `freegma_postgres`, `freegma_assets`, `freegma_caddy_data`, `freegma_caddy_config` |
| MCP test output | `tests/output/` |

## Everyday commands

```bash
make up | down | ps | logs S=penpot-backend | health
make user EMAIL=… NAME=…           # new account (registration disabled)
make mcp-token [ROTATE=1]          # MCP key + Claude config
make mcp-test                      # MCP end-to-end test (project "MCP Sandbox")
make backup | make restore BACKUP=backups/daily/freegma-…
make update VERSION=x.y.z          # backup -> update -> smoke test -> rollback on failure
make branding                      # after editing branding/
```

Cron (daily backup): `15 3 * * * cd /volume1/docker/freegma && mkdir -p backups && ./scripts/backup.sh >> backups/backup.log 2>&1`

## Status

- [x] Stack healthy (all containers), HTTPS via Caddy internal CA
- [x] Branding (title, logo, favicon, login, accent colour, attribution)
- [x] Login, registration disabled
- [x] Create file, draw, PNG/SVG export
- [x] MCP: `make mcp-test` passes
- [x] Backup + restore into a fresh stack tested
- [x] Update 2.18.2 -> 2.18.3 incl. rollback rehearsal tested
- [x] CI green (lint + e2e), images published to GHCR as `edge` / `sha-*`
- [x] Independent code review done, findings fixed
- [ ] Deploy on the NAS (check `uname -m`, free ports 80/443, DNS record)
- [ ] Trust root CA on PC/phone (`make ca-cert`)
- [ ] Connect Claude Code / Claude Desktop
- [ ] Set `BACKUP_DIR` to a second volume + cron
- [ ] Docker Hub secrets in GitHub, tag `v1.0.0`, make GHCR packages public

## Notes

- MCP needs an open Freegma tab with the file (toolbar shows "● MCP").
- Claude Desktop: use the `mcp-remote` bridge, not a custom connector (the cloud cannot reach the LAN).
- Upgrades: read Penpot release notes, then `make update VERSION=…`, then `make branding-check`.

Last updated: 2026-10-12
