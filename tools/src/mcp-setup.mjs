#!/usr/bin/env node
// Enable MCP for a Freegma user and print ready-to-paste client configs.
//
//   make mcp-token                 # reuse the current key (or create one)
//   make mcp-token ROTATE=1        # revoke the old key and create a new one
//
// Same result as Account -> Integrations -> MCP Server in the UI.
// Env: FREEGMA_PUBLIC_URI, FREEGMA_TEST_EMAIL, FREEGMA_TEST_PASSWORD,
//      optional FREEGMA_MCP_ROTATE=1, FREEGMA_MCP_EXPIRATION (e.g. "720h"),
//      optional FREEGMA_ENV_FILE (path of .env to update)

import fs from "node:fs";
import { PenpotClient } from "./penpot.mjs";
import { requireEnv, step, ok, fail } from "./util.mjs";

const BASE = requireEnv("FREEGMA_PUBLIC_URI").replace(/\/+$/, "");
const EMAIL = requireEnv("FREEGMA_TEST_EMAIL");
const PASSWORD = requireEnv("FREEGMA_TEST_PASSWORD");
const ROTATE = process.env.FREEGMA_MCP_ROTATE === "1";
const EXPIRATION = process.env.FREEGMA_MCP_EXPIRATION || undefined;
const ENV_FILE = process.env.FREEGMA_ENV_FILE;

function upsertEnv(file, values) {
  let text = fs.readFileSync(file, "utf8");
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, "\n")}${line}\n`;
  }
  fs.writeFileSync(file, text);
}

async function main() {
  step(`Logging in as ${EMAIL}`);
  const api = new PenpotClient(BASE);
  await api.login(EMAIL, PASSWORD);
  ok("logged in");

  step(ROTATE ? "Rotating MCP key" : "Ensuring MCP is enabled");
  const { token, created } = await api.ensureMcpKey({ rotate: ROTATE, expiration: EXPIRATION });
  ok(created ? "new MCP key created (any previous key is revoked)" : "using the existing MCP key");

  const url = `${BASE}/mcp/stream?userToken=${token}`;

  if (ENV_FILE && fs.existsSync(ENV_FILE)) {
    upsertEnv(ENV_FILE, { FREEGMA_MCP_USER_EMAIL: EMAIL, FREEGMA_MCP_TOKEN: token });
    ok(`stored in ${ENV_FILE.replace(/^\/work\//, "")} (FREEGMA_MCP_TOKEN)`);
  }

  console.log(`
MCP server URL (treat it like a password):
  ${url}

Claude Code:
  claude mcp add --transport http freegma "${url}"

Claude Desktop (local bridge; works for LAN/Tailscale-only servers):
  claude_desktop_config.json ->
  {
    "mcpServers": {
      "freegma": {
        "command": "npx",
        "args": ["-y", "mcp-remote@0.14.3", "${url}"${BASE.startsWith("http:") ? ', "--allow-http"' : ""}]${BASE.startsWith("https:") ? `,
        "env": { "NODE_EXTRA_CA_CERTS": "/path/to/freegma-root-ca.crt" }` : ""}
      }
    }
  }
  (Custom connectors in Claude Desktop/claude.ai are called from Anthropic's
   cloud and cannot reach a server that is only on your LAN.)
${BASE.startsWith("https:") ? `
With FREEGMA_TLS=internal, export the CA once with \`make ca-cert\` and trust it
(or point NODE_EXTRA_CA_CERTS at it, as above).
` : ""}
Then open any file in Freegma - the MCP plugin connects automatically
(toolbar shows "MCP"). Keep that tab open while Claude works.`);
}

main().catch((err) => fail(err));
