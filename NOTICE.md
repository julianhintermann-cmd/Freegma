# Notices

## Freegma

Freegma - self-hosted, branded Penpot with a built-in MCP server.
Copyright (c) 2026 Julian Hintermann and Freegma contributors.
Licensed under the Mozilla Public License 2.0 (see `LICENSE`).

Freegma's own files: `docker-compose.yml`, `proxy/`, `branding/`, `caddy/`,
`scripts/`, `tests/`, `docs/` and the CI workflows.
The Freegma logo and login illustration in `branding/` are original works
released under the same licence.

## Penpot

Freegma runs the official, unmodified Penpot Docker images
(`penpotapp/frontend`, `penpotapp/backend`, `penpotapp/exporter`,
`penpotapp/mcp`).

Penpot - The open-source design & prototyping platform.
Copyright (c) KALEIDOS INC and Penpot contributors.
Licensed under the Mozilla Public License 2.0.
Source code: https://github.com/penpot/penpot

At delivery time the Freegma proxy modifies two kinds of Penpot files in
transit: `index.html` (a stylesheet and script are injected and the logo
symbols are swapped by that script) and the UI translation bundles
(`js/translation.*.js`, see `branding/text-replacements.tsv`). These
modifications are fully described by the source files in this repository,
which are available under MPL-2.0.

"Penpot" and the Penpot logo are trademarks of their respective owners.
Freegma is an independent project and is not affiliated with or endorsed by
Kaleidos or the Penpot project. The Penpot name appears only in factual
attribution ("based on Penpot").

## Third-party images

- PostgreSQL (`postgres`) - PostgreSQL License
- Valkey (`valkey/valkey`) - BSD-3-Clause
- Caddy (`caddy`) - Apache-2.0
- nginx (`nginx`, base of the Freegma image) - BSD-2-Clause
- Mailpit (`axllent/mailpit`, optional) - MIT
