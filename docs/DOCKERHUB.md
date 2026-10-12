# Freegma

**Self-hosted, branded [Penpot](https://penpot.app) with a built-in MCP server for Claude.**

This image is the **Freegma branding proxy**: a small nginx (~90 MB,
`linux/amd64` + `linux/arm64`) that sits in front of the official,
unmodified `penpotapp/frontend` and swaps logo, favicon, accent colours,
login artwork and selected UI texts at delivery time. No Penpot fork.

The complete stack (Penpot 2.18.3, PostgreSQL, Valkey, HTTPS via Caddy, MCP,
backups, safe updates, tests) lives in the GitHub repository:
**https://github.com/julianhintermann-cmd/Freegma**

## Quick start (full stack)

```bash
git clone https://github.com/julianhintermann-cmd/Freegma.git freegma && cd freegma
make init DOMAIN=freegma.home.arpa
make up
make admin EMAIL=you@example.com NAME="Your Name"
```

## Use only the proxy

```yaml
services:
  freegma:
    image: <namespace>/freegma:1.0.0       # or ghcr.io/julianhintermann-cmd/freegma:1.0.0
    environment:
      FREEGMA_UPSTREAM: http://penpot-frontend:8080
      FREEGMA_BRAND_NAME: Acme Design
      FREEGMA_PENPOT_VERSION: "2.18.3"
    volumes:
      - ./branding:/etc/freegma/branding:ro  # optional overrides
    ports: ["9001:8080"]
```

| Variable | Default | |
|---|---|---|
| `FREEGMA_UPSTREAM` | `http://penpot-frontend:8080` | Penpot frontend |
| `FREEGMA_BRAND_NAME` | `Freegma` | Brand name |
| `FREEGMA_ACCENT_DARK` / `FREEGMA_ACCENT_LIGHT` | – | Accent colours |
| `FREEGMA_REBRAND_TEXT` | `true` | UI text replacements |
| `FREEGMA_SHOW_ATTRIBUTION` | `true` | "based on Penpot (MPL-2.0)" notice |
| `FREEGMA_SOURCE_URL` | GitHub repo | Link in the attribution |

Branding files (mount any subset at `/etc/freegma/branding`): `logo.svg`,
`logo-icon.svg`, `favicon.svg`, `favicon.png`, `apple-touch-icon.png`,
`login-illustration.svg|png|jpg|webp`, `freegma.css`, `text-replacements.tsv`.
Health endpoint: `/freegma/healthz`.

Tags: `X.Y.Z`, `X.Y`, `edge`, `sha-<commit>`; no `latest` (pin versions).

## License

MPL-2.0. Freegma is based on Penpot (MPL-2.0, © Kaleidos and contributors) and
is not affiliated with or endorsed by Kaleidos/Penpot or Figma.
