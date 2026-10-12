# Branding

Freegma rebrands Penpot **without forking it**. The official
`penpotapp/frontend` image is served unchanged; the Freegma proxy
(`proxy/`, published as `ghcr.io/julianhintermann-cmd/freegma`) sits in
front of it and adjusts two kinds of responses on the fly.

## What you can change

Everything is in `branding/`. After editing files there or any
`FREEGMA_*` setting in `.env`, run `make branding`. This recreates only the
proxy, which re-renders its assets at start-up.

| File | Used for | Notes |
|---|---|---|
| `logo.svg` | Wordmark on the login screen | Any `viewBox`; ~3:1 looks best. Elements without a `fill` take the theme's text colour. |
| `logo-icon.svg` | Square mark: dashboard team switcher, workspace menu, loader | `viewBox="0 0 500 500"` recommended. |
| `favicon.svg` | Browser tab icon | Modern browsers use the SVG. |
| `favicon.png` | Fallback icon (served for Penpot's own `/images/favicon.png`) | 64×64. |
| `apple-touch-icon.png` | iOS/iPadOS home screen | 180×180. |
| `login-illustration.svg` | Login screen artwork | `.svg`, `.webp`, `.png` or `.jpg`; the first one found wins. |
| `freegma.css` | Accent colours and any extra CSS | Loaded after Penpot's CSS. |
| `text-replacements.tsv` | UI text replacements | `search<TAB>replacement`, `{{BRAND}}` = brand name. |

Environment variables (in `.env`):

| Variable | Effect |
|---|---|
| `FREEGMA_BRAND_NAME` | Brand name in titles, UI texts (`{{BRAND}}`), attribution, about page |
| `FREEGMA_ACCENT_DARK`, `FREEGMA_ACCENT_LIGHT` | Quick accent override without editing CSS |
| `FREEGMA_REBRAND_TEXT=false` | Disable all text replacements |
| `FREEGMA_SHOW_ATTRIBUTION=false` | Hide the "based on Penpot" line (please keep it when you distribute Freegma; see "Licence" below) |

### Logo colours

The bundled logos use CSS variables so you can recolour them from
`freegma.css` without touching the SVGs:

```css
:root {
  --freegma-logo-bg: #ff6a3d;   /* tile */
  --freegma-logo-fg: #ffffff;   /* the "F" */
  --freegma-logo-node: #2b1a14; /* node dot */
}
```

### Accent colour

Penpot defines its colours as CSS custom properties on the theme classes
`.default` (dark UI) and `.light` (light UI). Freegma overrides the primary
accent:

```css
.default { --color-accent-primary: #ff8a5c; --color-accent-primary-muted: #5a3324; }
.light   { --color-accent-primary: #c2410c; --color-accent-primary-muted: #fbd9c8; }
```

Pick colours with enough contrast: in the dark theme, primary buttons put
dark text on the accent; in the light theme, white text.

### UI texts

`text-replacements.tsv` holds exact strings as they appear in Penpot's
translation bundles. Matching is literal but **case-insensitive** (nginx
`sub_filter`), so `- Penpot"` also matches `- penpot"`; `$` is not allowed
(nginx would treat it as a variable). Texts that are *about* Penpot
(changelog, "About Penpot", community, the `.penpot` file format) are left
alone on purpose. To find a string:

```bash
docker compose exec penpot-frontend sh -c \
  "grep -o '\"[a-z0-9.-]*\":\"[^\"]*Penpot[^\"]*\"' /var/www/app/js/translation.en.js"
```

## How it works

```
Browser ── GET /                      ──► freegma ──► penpot-frontend
           ◄── index.html + <link freegma.css> + <script freegma.js>   (sub_filter)
Browser ── GET /js/translation.de.js  ──► freegma ──► penpot-frontend
           ◄── texts with {{BRAND}} replacements                       (sub_filter)
Browser ── GET /freegma/*             ──► freegma (static, generated from branding/)
Browser ── everything else            ──► freegma ──► penpot-frontend  (untouched)
```

At container start, `proxy/scripts/40-freegma-branding.sh`:

1. copies `branding/` (mounted at `/etc/freegma/branding`, falling back to the
   defaults baked into the image) to `/var/lib/freegma/www`,
2. embeds both logos and the settings into `/freegma/freegma.js`,
3. renders the nginx snippets: `html-filters.conf`, `text-filters.conf`,
   `login-illustration.conf`, `resolver.conf` (in `/etc/nginx/freegma/`),
4. adds a content hash to every injected URL so browsers pick up changes.

In the browser, `freegma.js`:

- replaces the **logo `<symbol>`s** in Penpot's inline SVG sprite. Every
  `<use href="#…">` in the app follows automatically, so no DOM patching or
  React internals are involved,
- rewrites **"Penpot"** in the window title (any UI language),
- shows the **attribution** line on the login, dashboard and settings
  screens, and never on the canvas.

## Penpot internals Freegma relies on

Verified against Penpot **2.18.3**. Re-check them after upgrading
(`make branding-check` checks them automatically and tells you which one failed).

| What | Where | Used by |
|---|---|---|
| `</head>` and `<div id="app"></div>` in `index.html` | injection anchors | `html-filters.conf` |
| Sprite symbols `asset-penpot-logo`, `icon-penpot-logo` | wordmark | `freegma.js` `WORDMARK_SYMBOLS` |
| Sprite symbols `icon-penpot-logo-icon`, `asset-penpot-logo-icon`, `icon-penpot-logo-icon-loader` | square mark | `freegma.js` `ICON_SYMBOLS` |
| `/images/registration-illustration.png` | login artwork `<img>` | `login-illustration.conf` |
| `/images/favicon.png` | stock favicon link | proxy `location` |
| `/js/translation.<lang>.js` | UI texts | `text-filters.conf` |
| `.default` / `.light` + `--color-accent-primary(-muted)` | theme colours | `freegma.css` |
| `.main_ui_auth__logo` | login logo size | `freegma.css` |
| Hash routes `#/auth`, `#/dashboard`, `#/settings`, `#/workspace`, `#/view` | attribution visibility | `freegma.js` |
| `window.penpotVersion` in `index.html` | version detection | smoke test |
| `.main_ui_static__penpot-logo`, `.main_ui_static__deco-*` | logo on error / 404 pages (inline SVG) | `freegma.css` |
| `<head>` of `/plugins/mcp/index.html` | injects `worker-timers.js` (background MCP) | `mcp-plugin-filters.conf` |
| SES `getEnvironmentOption` reads `globalThis.process.env.LOCKDOWN_OVERRIDE_TAMING`; `libs.js` reassigns `window.process` | plugin-sandbox hardening | `freegma.js` |
| `libs.js` installs global `harden`/`hardenIntrinsics` (SES `repairIntrinsics`) and starts plugins with `harden(api)` before `hardenIntrinsics()` | `toString` override fix (harden order) | `freegma.js` |

If something breaks after an upgrade, it degrades gracefully: you see
Penpot's original logo or text again, and Penpot itself keeps working.
Fix it like this:

```bash
make branding-check                                   # which check fails?
docker compose exec penpot-frontend sh -c \
  'grep -o "id=\"[a-z0-9-]*logo[a-z0-9-]*\"" /var/www/app/index.html'   # current symbol ids
```

Update the ids in `proxy/www/freegma.js` or the selectors in
`branding/freegma.css`, run `make build && make branding`, and check again.

## Licence and attribution

Penpot is MPL-2.0. Freegma modifies two Penpot files *in transit*
(`index.html`, translation bundles). The complete modification is the
source in this repository, which is also MPL-2.0. The UI shows "Freegma –
based on Penpot (MPL-2.0)" with links to the Penpot source of the running
version and to this repository, and `/freegma/about.html` explains the
relationship. Keep `FREEGMA_SHOW_ATTRIBUTION=true` (or another visible
notice) when you offer Freegma to others. Do not use Penpot's name or logo
as your product's branding.
