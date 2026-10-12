# Architecture

## Services

| Service | Image (pinned) | Role | Port (internal) | Health check |
|---|---|---|---|---|
| `caddy` *(profile https)* | `caddy:2.11.7-alpine` | TLS termination, HTTP→HTTPS redirect | 80, 443 (published) | admin API `:2019/config/` |
| `freegma` | `ghcr.io/julianhintermann-cmd/freegma` | Branding proxy (nginx 1.30) | 8080 (published on 127.0.0.1:9001) | `/freegma/healthz` |
| `penpot-frontend` | `penpotapp/frontend:2.18.3` | SPA + nginx router for `/api`, `/ws`, `/mcp/*`, `/assets` | 8080 | `/readyz` (proxied to the backend) |
| `penpot-backend` | `penpotapp/backend:2.18.3` | JVM API server, RPC, websockets, storage | 6060 (+ PREPL 6063 on localhost) | `/readyz` |
| `penpot-exporter` | `penpotapp/exporter:2.18.3` | Headless browser for PNG/SVG/PDF exports | 6061 | TCP 6061 |
| `penpot-mcp` | `penpotapp/mcp:2.18.3` | MCP server (`--multi-user`) | 4401 (HTTP), 4402 (WS) | TCP 4401 + 4402 |
| `penpot-postgres` | `postgres:15.19` | Database | 5432 | `pg_isready` |
| `penpot-valkey` | `valkey/valkey:8.1.10` | Pub/sub for websockets, cache | 6379 | `valkey-cli ping` |
| `penpot-mailpit` *(profile mailpit)* | `axllent/mailpit:v1.31.5` | Test mail catcher | 1025, UI 8025 on 127.0.0.1 | – |
| `tools` *(on demand)* | `ghcr.io/julianhintermann-cmd/freegma-tools` | Smoke/MCP tests (Playwright 1.63, MCP SDK 1.32.1) | host network | – |

Startup order (all `condition: service_healthy`): postgres + valkey →
backend → exporter + mcp → frontend → freegma → caddy.

Not included: Penpot's `admin-console` ("Nitrate", organisation and licence
management). Freegma does not enable the `admin-console` flag.

## Network and exposure

- One bridge network `freegma_net`. Only `caddy` (80/443) and `freegma`
  (127.0.0.1:9001 by default) publish ports.
- Containers keep outbound internet access: Google Fonts, the template
  gallery and SMTP need it. Add `enable-air-gapped-conf` to
  `PENPOT_EXTRA_FLAGS` for fully offline use (Penpot then disables the Google
  Fonts provider and the templates section).
- The `tools` container uses the host network and resolves `FREEGMA_DOMAIN`
  to `FREEGMA_TOOLS_HOST_IP` (default `127.0.0.1`), so tests hit the public
  URL exactly like a browser.

## Data

| Volume | Content | Backed up as |
|---|---|---|
| `freegma_postgres` | All design data, users, teams, tokens | `database.dump` (pg_dump -Fc) |
| `freegma_assets` | Uploaded images, fonts, thumbnails | `assets.tar.gz` |
| `freegma_caddy_data` | Certificates, internal CA | `caddy-data.tar.gz` |
| `freegma_caddy_config` | Caddy autosave config | – (regenerated) |
| `.env`, `branding/` | Configuration | `env`, `branding.tar.gz` |

## Penpot configuration

Taken from the official compose file
([`docker/images/docker-compose.yaml` @ 2.18.3](https://github.com/penpot/penpot/blob/2.18.3/docker/images/docker-compose.yaml))
and the [configuration guide](https://help.penpot.app/technical-guide/configuration/).
Flag names were checked against `common/src/app/common/flags.cljc` @ 2.18.3.

| Flag | Why |
|---|---|
| `disable-registration` | No public sign-up (this also blocks sign-up via invitations) |
| `enable-login-with-password` | Password login |
| `disable-email-verification` | Admin-created accounts work without mail |
| `disable-onboarding` | No onboarding questionnaire for new users |
| `enable-prepl-server` | Needed by `manage.py` (user CLI); listens on localhost inside the backend only |
| `enable-mcp` | MCP routes in the frontend nginx, MCP UI in Penpot |
| `enable-access-tokens` *(default extra)* | Personal API tokens in *Integrations* |

`secure-session-cookies` stays at Penpot's default (on). Penpot disables it
automatically when `PENPOT_PUBLIC_URI` is plain `http://` on a non-localhost
host, so HTTP mode keeps working.

## Branding proxy

See [BRANDING.md](BRANDING.md). In short: nginx `sub_filter` on
`index.html` and the translation bundles only, `Accept-Encoding` stripped
for those two locations, compression re-applied by the proxy, upstream
re-resolved via Docker DNS (so a recreated frontend is found again),
unbuffered pass-through for `/mcp/stream` and websockets.

## MCP

See [MCP.md](MCP.md).
