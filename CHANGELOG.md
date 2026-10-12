# Changelog

All notable changes to Freegma. Versions refer to the Freegma images
(`freegma`, `freegma-tools`); the bundled Penpot version is listed per release.

## 1.1.0 - 2026-10-12

- MCP works with the Freegma tab in the background: the MCP plugin's
  heartbeat timers run on a Web Worker and the plugin holds a Web Lock
  (`FREEGMA_MCP_BACKGROUND`, default on)
- Fixed "Internal Error" (`"toString" is read-only`) as soon as an MCP agent
  works in a file: Penpot 2.18 hardens the plugin API before
  `hardenIntrinsics()`, which froze `Object.prototype`/`Function.prototype`
  before SES could make `toString` & co. overridable. Freegma now runs
  `hardenIntrinsics()` first (the order SES documents). Side effect: plugin
  calls such as `library.local.createComponent` work again
- Penpot's plugin sandbox (SES) runs with `overrideTaming: severe`, so
  scripts overriding frozen built-ins no longer crash the workspace
  (`FREEGMA_SES_OVERRIDE_TAMING`, default `severe`; `off` disables both fixes)
- Freegma logo on Penpot's error and 404 pages
- NAS: ready-to-run compose files for a plain NAS (`deploy/nas`) and behind
  Nginx Proxy Manager (`deploy/nas-npm`)

## 1.0.0 - 2026-10-12

First release. Penpot **2.18.3**.

- Docker Compose stack on the official Penpot images (frontend, backend,
  exporter, MCP server), PostgreSQL 15.19, Valkey 8.1.10; every image pinned,
  every service health-checked
- Freegma branding proxy (nginx 1.30.5): logo, favicon, accent colours, login
  artwork, UI texts and Penpot attribution, configured from `branding/`
- HTTPS via Caddy 2.11.7 (internal CA or Let's Encrypt), optional Mailpit
- Public registration disabled; user CLI (`make user`)
- MCP: Penpot's MCP server in multi-user mode at `/mcp/stream`;
  `make mcp-token` (enable, rotate, expiry) and `make mcp-test` (end-to-end)
- Backups (database, assets, certificates, config; 7 daily / 4 weekly),
  restore (also onto a new host), updates with smoke test and automatic rollback
- `freegma-tools` image: smoke test, MCP setup, MCP E2E test
- CI: lint + full end-to-end test; multi-arch images (amd64/arm64) to GHCR and Docker Hub
