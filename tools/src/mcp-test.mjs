#!/usr/bin/env node
// Freegma MCP end-to-end test (`make mcp-test`).
//
// Reproduces what Claude does through the Penpot MCP server, fully automated:
//   1. log in through the API, ensure project + file "MCP Sandbox",
//      ensure the user has MCP enabled and an MCP key
//   2. open the file in a headless browser -> Penpot's built-in MCP plugin
//      auto-connects to /mcp/ws with the user's MCP key
//   3. connect an MCP client to /mcp/stream?userToken=<key> (exactly the URL
//      Claude Code / Claude Desktop use) and:
//        - create a page with a 393x852 frame, a text and a rectangle
//        - read the page back and verify it
//        - export the frame as PNG (and SVG)
//
// Env: FREEGMA_PUBLIC_URI, FREEGMA_TEST_EMAIL, FREEGMA_TEST_PASSWORD,
//      optional FREEGMA_MCP_TOKEN (otherwise the user's current key is used),
//      optional FREEGMA_TEST_OUTPUT (default ./output), FREEGMA_TEST_HEADFUL=1

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PenpotClient } from "./penpot.mjs";
import { requireEnv, step, ok, fail, sleep } from "./util.mjs";

const BASE = requireEnv("FREEGMA_PUBLIC_URI").replace(/\/+$/, "");
const EMAIL = requireEnv("FREEGMA_TEST_EMAIL");
const PASSWORD = requireEnv("FREEGMA_TEST_PASSWORD");
const OUT = path.resolve(process.env.FREEGMA_TEST_OUTPUT || "output");
const SANDBOX = "MCP Sandbox";

fs.mkdirSync(OUT, { recursive: true });

function toolText(result) {
  if (result.isError) {
    const msg = (result.content || []).map((c) => c.text || "").join("\n");
    throw new Error(msg || "tool returned an error");
  }
  return (result.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
}

// The MCP server reports some failures as normal text results.
function isFailureText(text) {
  return /^Tool execution failed|No Penpot instance connected|appears to be suspended/.test(text || "");
}

function parseResult(text) {
  if (isFailureText(text)) throw new Error(text);
  // execute_code returns JSON.stringify(data); data is { result, log } in 2.18.
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`unexpected execute_code output: ${text.slice(0, 300)}`);
  }
  return data && typeof data === "object" && "result" in data ? data.result : data;
}

async function main() {
  // ---- 1. API setup ---------------------------------------------------------
  step(`API login as ${EMAIL} at ${BASE}`);
  const api = new PenpotClient(BASE);
  await api.login(EMAIL, PASSWORD);
  const profile = await api.getProfile();
  ok(`logged in (profile ${profile.id})`);

  const project = await api.ensureProject(profile.defaultTeamId, SANDBOX);
  const file = await api.ensureFile(project.id, SANDBOX);
  ok(`project "${SANDBOX}" ${project.id}, file ${file.id}`);

  let token = process.env.FREEGMA_MCP_TOKEN || "";
  const mcp = await api.ensureMcpKey();
  if (!token) token = mcp.token;
  ok(`MCP enabled for user (${mcp.created ? "new key created" : "existing key"})`);

  // ---- 2. Browser: open the file so the MCP plugin connects ------------------
  step("Opening the file in headless Chromium (MCP plugin auto-connect)");
  const browser = await chromium.launch({
    headless: process.env.FREEGMA_TEST_HEADFUL !== "1",
    executablePath: process.env.FREEGMA_CHROMIUM_PATH || undefined,
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const authCookie = api.cookies.get("auth-token");
  if (!authCookie) throw new Error("no auth-token cookie received from login");
  await context.addCookies([{ name: "auth-token", value: authCookie, url: BASE }]);
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (e) => browserErrors.push(e.message));
  if (process.env.FREEGMA_DEBUG) {
    page.on("console", (m) => console.log(`  [browser:${m.type()}] ${m.text().slice(0, 300)}`));
  }
  await page.goto(`${BASE}/#/workspace?team-id=${profile.defaultTeamId}&file-id=${file.id}`,
                  { waitUntil: "domcontentloaded" });

  // ---- 3. MCP client --------------------------------------------------------------
  step("Connecting MCP client to /mcp/stream");
  const client = new Client({ name: "freegma-mcp-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`${BASE}/mcp/stream?userToken=${encodeURIComponent(token)}`));
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  ok(`tools: ${names.join(", ")}`);
  for (const required of ["execute_code", "export_shape"]) {
    if (!names.includes(required)) throw new Error(`MCP tool "${required}" missing`);
  }

  // Wait until the plugin in the browser tab has registered with the server.
  step("Waiting for the Penpot tab to connect to the MCP server");
  let connected = false;
  for (let i = 0; i < 45 && !connected; i++) {
    const res = await client.callTool({ name: "execute_code", arguments: { code: "return { ok: true };" } });
    const text = (res.content || []).map((c) => c.text || "").join("\n");
    if (!res.isError && !isFailureText(text)) connected = true;
    else await sleep(2000);
  }
  if (!connected) {
    await page.screenshot({ path: path.join(OUT, "mcp-test-failure.png") });
    throw new Error("Penpot tab never connected to the MCP server (see output/mcp-test-failure.png)");
  }
  ok("plugin connected");

  // ---- 4. Create ----------------------------------------------------------------
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const pageName = `MCP Test ${stamp}`;
  step(`Creating page "${pageName}" with frame 393x852, text and rectangle`);
  const createCode = `
    const page = penpot.createPage();
    page.name = ${JSON.stringify(pageName)};
    await penpot.openPage(page);
    const board = penpot.createBoard();
    board.name = "iPhone 393x852";
    board.resize(393, 852);
    board.x = 0; board.y = 0;
    board.fills = [{ fillColor: "#FFFFFF", fillOpacity: 1 }];
    page.root.appendChild(board);
    const text = penpot.createText("Hello from Claude via Freegma MCP");
    text.name = "Headline";
    text.fontSize = "24";
    text.x = 24; text.y = 80;
    text.fills = [{ fillColor: "#1F1F1F", fillOpacity: 1 }];
    board.appendChild(text);
    const rect = penpot.createRectangle();
    rect.name = "Card";
    rect.resize(345, 200);
    rect.x = 24; rect.y = 160;
    rect.borderRadius = 16;
    rect.fills = [{ fillColor: "#FF6A3D", fillOpacity: 1 }];
    board.appendChild(rect);
    return { pageId: page.id, boardId: board.id, textId: text.id, rectId: rect.id };
  `;
  const created = parseResult(toolText(await client.callTool({ name: "execute_code", arguments: { code: createCode } })));
  ok(`created board ${created.boardId}`);

  // ---- 5. Read back -------------------------------------------------------------
  step("Reading the design back");
  const readCode = `
    const board = penpot.currentPage.getShapeById(${JSON.stringify(created.boardId)});
    return {
      page: penpot.currentPage.name,
      board: { name: board.name, type: board.type, width: board.width, height: board.height },
      children: board.children.map(c => ({ name: c.name, type: c.type, width: Math.round(c.width), height: Math.round(c.height),
                                           text: c.type === "text" ? c.characters : undefined }))
    };
  `;
  const read = parseResult(toolText(await client.callTool({ name: "execute_code", arguments: { code: readCode } })));
  fs.writeFileSync(path.join(OUT, "mcp-test-readback.json"), JSON.stringify(read, null, 2));
  if (read.page !== pageName) throw new Error(`focused page is "${read.page}", expected "${pageName}"`);
  if (Math.round(read.board.width) !== 393 || Math.round(read.board.height) !== 852) {
    throw new Error(`board is ${read.board.width}x${read.board.height}, expected 393x852`);
  }
  const types = read.children.map((c) => c.type).sort().join(",");
  if (types !== "rectangle,text") throw new Error(`unexpected children: ${JSON.stringify(read.children)}`);
  const textChild = read.children.find((c) => c.type === "text");
  if (!/Hello from Claude/.test(textChild.text || "")) throw new Error(`text content mismatch: ${textChild.text}`);
  ok(`board ${read.board.width}x${read.board.height} with ${read.children.length} children verified`);

  // ---- 6. Export ------------------------------------------------------------------
  step("Exporting the frame as PNG and SVG via export_shape");
  const png = await client.callTool({ name: "export_shape", arguments: { shapeId: created.boardId, format: "png" } });
  if (png.isError) throw new Error(`PNG export failed: ${toolText(png)}`);
  const img = (png.content || []).find((c) => c.type === "image");
  if (!img) throw new Error("PNG export returned no image content");
  const pngBuf = Buffer.from(img.data, "base64");
  if (pngBuf.subarray(1, 4).toString() !== "PNG") throw new Error("export is not a PNG");
  const pngPath = path.join(OUT, "mcp-test.png");
  fs.writeFileSync(pngPath, pngBuf);
  ok(`PNG ${pngBuf.length} bytes -> ${pngPath}`);

  const svg = await client.callTool({ name: "export_shape", arguments: { shapeId: created.boardId, format: "svg" } });
  const svgText = toolText(svg);
  if (!svgText.includes("<svg")) throw new Error("SVG export returned no <svg>");
  const svgPath = path.join(OUT, "mcp-test.svg");
  fs.writeFileSync(svgPath, svgText.slice(svgText.indexOf("<svg")));
  ok(`SVG ${svgText.length} chars -> ${svgPath}`);

  await client.close();
  await page.screenshot({ path: path.join(OUT, "mcp-test-workspace.png") });
  await browser.close();
  if (browserErrors.length) console.log(`  (browser reported ${browserErrors.length} page errors; first: ${browserErrors[0]})`);

  console.log(`\nMCP TEST PASSED - see page "${pageName}" in file "${SANDBOX}".`);
}

main().catch((err) => fail(err));
