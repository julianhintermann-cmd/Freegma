# MCP: let Claude design in Freegma

Freegma runs Penpot's **official MCP server** (`penpotapp/mcp`, multi-user
mode) next to Penpot. Your AI client talks to it over HTTPS; there are no
per-call limits, because it is your server.

Sources: [help.penpot.app/mcp](https://help.penpot.app/mcp/) ·
[penpot/mcp README](https://github.com/penpot/penpot/blob/2.18.3/mcp/README.md)
(verified against Penpot 2.18.3).

## How the pieces fit

```
 Claude Code / Claude Desktop (mcp-remote)
        │  HTTPS  POST/GET /mcp/stream?userToken=<MCP key>
        ▼
 caddy ─► freegma ─► penpot-frontend (nginx)
                         │  /mcp/stream ─► penpot-mcp:4401/mcp   (MCP, streamable HTTP)
                         │  /mcp/ws     ─► penpot-mcp:4402       (plugin bridge)
                         ▼
 penpot-mcp  ◄──── WebSocket /mcp/ws?userToken=<same key> ────  MCP plugin in YOUR browser tab
                                                                 (built into Penpot; starts when you
                                                                  open a file with MCP enabled)
```

- The MCP server pairs the AI client and your browser tab **by the MCP key**.
  Every tool call is executed by the plugin in that tab, against the **page
  in focus**, using the Penpot Plugin API.
- Without an open tab, tools answer *"No Penpot instance connected for user token"*.
- Only one tab per user holds the MCP connection. Pick it via
  *File → MCP Server → Connect* if you have several.
- **Background tabs:** the plugin proves it is alive with a heartbeat every
  10 s; the server rejects tasks after 30 s without one. Browsers throttle
  timers in hidden tabs (Chrome/Edge: once per minute after 5 minutes), so
  Freegma injects `/freegma/worker-timers.js` into the plugin page: its
  intervals run on a Web Worker (not throttled) and it holds a Web Lock that
  asks the browser not to freeze the tab. The tab can stay in the
  background; it must not be closed or unloaded. Disable with
  `FREEGMA_MCP_BACKGROUND=false`.

## Setup

1. **Enable MCP for your account and get the key**
   - CLI: `make mcp-token` (stores the key as `FREEGMA_MCP_TOKEN` in `.env`), or
   - UI: *Your account → Integrations → MCP Server → Status: enabled → Generate key*.
     Below the server URL, Freegma's **Connect your AI client** box shows the
     Claude Code command and the JSON for Claude Desktop / Cursor with your key
     filled in, each with a **Copy** button. After *Regenerate MCP key* it
     switches to the new key at once (Penpot's own URL field updates only after
     a reload).
2. **Add the server to your client** (URL = `https://<host>/mcp/stream?userToken=<key>`):

   | Client | How |
   |---|---|
   | Claude Code | `claude mcp add --transport http freegma "<URL>"` (add `--scope user` to use it in every project) |
   | Claude Desktop | `mcp-remote` bridge in `claude_desktop_config.json` (see README). Not a custom connector: those run in Anthropic's cloud and cannot reach your LAN. |
   | Others (Cursor, VS Code, …) | `npx -y add-mcp -g -n freegma "<URL>"`, or the client's "remote/HTTP MCP server" setting |

3. **Open a design file** in Freegma. The toolbar shows **● MCP** when connected.
4. Run `make mcp-test` once to prove the whole chain works.

### Internal CA and Node-based clients

With `FREEGMA_TLS=internal`, Node.js clients (Claude Code, `mcp-remote`)
need to trust Freegma's root certificate:

```bash
make ca-cert                                  # -> ./freegma-root-ca.crt
export NODE_EXTRA_CA_CERTS=$PWD/freegma-root-ca.crt   # macOS/Linux, before starting the client
```

For Claude Desktop, put it in the server's `"env"` block (see README).

## Tools (remote/multi-user mode)

| Tool | Purpose |
|---|---|
| `execute_code` | Runs JavaScript in the plugin with `penpot`, `penpotUtils` and `storage` in scope. This is how Claude reads and creates shapes, pages, components and tokens. |
| `high_level_overview` | Usage instructions for the model |
| `penpot_api_info` | Plugin API reference lookups |
| `export_shape` | Export a shape, `"selection"` or `"page"` as PNG (image returned to the client) or SVG (text) |

Not available remotely: `import_image` from local file paths (it needs the
local MCP server, see "Fallback" below).

## Good first prompts

- *"Give me a high-level overview of the open Freegma file."*
- *"List all pages and the top-level boards on the current page."*
- *"Create a new page 'Onboarding' with three 393×852 iPhone frames: welcome, sign-in, permissions. Use an 8-pt grid."*
- *"Export the board 'Home' as PNG and describe what you see."*

Ask Claude to describe changes before it applies them, and work in small
steps. Penpot's *History* panel undoes agent changes.

## The automated test (`make mcp-test`)

`tools/src/mcp-test.mjs`, run in the `freegma-tools` container:

1. logs in via the API, ensures project **MCP Sandbox** with file **MCP Sandbox**,
   ensures MCP is enabled and a key exists,
2. opens the file in headless Chromium, so the built-in plugin connects,
3. connects an MCP client (`@modelcontextprotocol/sdk`) to `/mcp/stream`,
4. `execute_code`: creates page *MCP Test <time>* with a 393×852 board, a text and a rounded rectangle,
5. `execute_code`: reads the page back and checks name, size, children and text,
6. `export_shape`: PNG and SVG, both written to `tests/output/`.

The test leaves the page in place so you can look at it.

## Security

- The MCP key is a bearer secret. Anyone with the URL can act as you **in
  your open tab** (create, change, delete on the focused page).
- One key per user; generating a new one revokes the old one immediately:
  `make mcp-token ROTATE=1` or *Integrations → Regenerate*. Rotate after
  sharing screenshots, logs or configs, and when a device is lost.
- Expiring keys: `make mcp-token ROTATE=1 FREEGMA_MCP_EXPIRATION=720h` (30 days).
- Keep experiments in *MCP Sandbox*, and keep production design files in
  other projects or close their tabs while an agent works.
- Freegma is LAN/Tailscale-only by default. Do not expose `/mcp/*` publicly.
- To switch MCP off: *Integrations → MCP Server → disable*. For the whole
  instance, remove `enable-mcp` from the flags in `docker-compose.yml`.

## Fallback: local MCP server

Penpot also ships the MCP server as an npm package that runs on your own
computer, together with a plugin server:

```bash
npx -y @penpot/mcp@stable
#  MCP (streamable HTTP): http://localhost:4401/mcp
#  plugin manifest:       http://localhost:4400/manifest.json
```

In Freegma: *Plugins → Load from URL* → `http://localhost:4400/manifest.json`
→ open the plugin → *Connect to MCP server*, and keep the plugin window open.
In Claude Code: `claude mcp add --transport http penpot-local http://localhost:4401/mcp`.
Chromium-based browsers may ask for permission to access the local network.
This mode adds local file access (`import_image`, exports to disk). Use an npm
version that matches your Penpot version (`npm view @penpot/mcp dist-tags`).

## Troubleshooting

| Message / symptom | Cause and fix |
|---|---|
| `No Penpot instance connected for user token` | No tab connected with this key: open a file, check **● MCP**, and check that the client uses the *current* key. |
| `… tab appears to be suspended` | The browser froze the tab. Focus it; in Chrome add the site to *Performance → Always keep these sites active*. |
| No **MCP** item in the toolbar | MCP is not enabled for the user (Integrations) or the key expired. Run `make mcp-token`. |
| Client cannot connect / TLS error | Trust the CA (`NODE_EXTRA_CA_CERTS`), or check the URL resolves from the client machine. |
| Works in one tab, not another | Only one tab per user holds MCP; the newest connection wins. |
| `export_shape`: `unable-to-upload-resource` | The exporter rendered the shape but the backend could not store it: the asset folder is not writable by UID 1001 (NAS shared-folder ACLs). Exporting `"page"` is not supported reliably; export boards or shapes. |
| `penpot-mcp` unhealthy | `make logs S=penpot-mcp`; the server listens on 4401 (HTTP) and 4402 (WebSocket). |
