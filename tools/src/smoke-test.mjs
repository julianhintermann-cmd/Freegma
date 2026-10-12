#!/usr/bin/env node
// Freegma smoke test - used by `make smoke`, `make branding-check` and
// scripts/update.sh (non-zero exit = roll back).
//
// Checks (all through the public URL, i.e. exactly what users hit):
//   - branding proxy health, Penpot backend readiness
//   - index.html carries the Freegma injection, favicon/logo assets served
//   - UI texts rebranded (translation bundle)
//   - public registration is disabled
//   - optional: login with FREEGMA_TEST_EMAIL / FREEGMA_TEST_PASSWORD
//   - optional browser check (default on; FREEGMA_SMOKE_BROWSER=0 to skip):
//     login page renders, Penpot logo symbols replaced, title rebranded,
//     attribution visible
//
// Env: FREEGMA_PUBLIC_URI (required), FREEGMA_BRAND_NAME (default Freegma)

import { PenpotClient } from "./penpot.mjs";
import { requireEnv, step, ok, fail } from "./util.mjs";

const BASE = requireEnv("FREEGMA_PUBLIC_URI").replace(/\/+$/, "");
const BRAND = process.env.FREEGMA_BRAND_NAME || "Freegma";
const EMAIL = process.env.FREEGMA_TEST_EMAIL || "";
const PASSWORD = process.env.FREEGMA_TEST_PASSWORD || "";
const BROWSER = process.env.FREEGMA_SMOKE_BROWSER !== "0";
const isTrue = (v, d) => ["1", "true", "yes", "on"].includes(String(v ?? d).toLowerCase());
const REBRAND_TEXT = isTrue(process.env.FREEGMA_REBRAND_TEXT, "true");
const SHOW_ATTRIBUTION = isTrue(process.env.FREEGMA_SHOW_ATTRIBUTION, "true");

let failures = 0;
function check(cond, msg) {
  if (cond) ok(msg);
  else { console.log(`  FAIL ${msg}`); failures++; }
}

async function get(pathname) {
  const res = await fetch(`${BASE}${pathname}`, { headers: { "accept-encoding": "identity" } });
  return { status: res.status, type: res.headers.get("content-type") || "", text: await res.text() };
}

async function main() {
  step(`HTTP checks against ${BASE}`);
  const health = await get("/freegma/healthz");
  check(health.status === 200, `branding proxy healthy (/freegma/healthz -> ${health.status})`);

  const ready = await get("/readyz");
  check(ready.status === 200, `Penpot backend ready (/readyz -> ${ready.status})`);

  const index = await get("/");
  check(index.status === 200, `index.html served (${index.status})`);
  check(index.text.includes("/freegma/freegma.css"), "branding stylesheet injected into index.html");
  check(index.text.includes("/freegma/freegma.js"), "branding script injected into index.html");
  check(index.text.includes("freegmaApplyLogos"), "logo swap hook injected before #app");
  const versionMatch = index.text.match(/penpotVersion = "([^"]+)"/);
  check(!!versionMatch, `Penpot version detected: ${versionMatch ? versionMatch[1] : "?"}`);

  const config = await get("/freegma/config.json");
  check(config.status === 200 && config.text.includes(`"name":`), "branding config served");
  for (const asset of ["favicon.svg", "logo.svg", "logo-icon.svg", "about.html"]) {
    const res = await get(`/freegma/${asset}`);
    check(res.status === 200, `/freegma/${asset} served`);
  }
  const illu = await get("/images/registration-illustration.png");
  check(illu.status === 200, `login illustration served (${illu.type || "?"})`);

  if (REBRAND_TEXT) {
    const tr = await get(`/js/translation.en.js${versionMatch ? `?version=${versionMatch[1]}` : ""}`);
    check(tr.status === 200, "translation bundle served");
    // Soft check: the user may have trimmed branding/text-replacements.tsv.
    if (tr.text.includes(BRAND)) ok("UI texts rebranded (translation.en.js)");
    else console.log(`  warn no "${BRAND}" in translation.en.js - check branding/text-replacements.tsv`);
  }

  step("Security checks");
  const api = new PenpotClient(BASE);
  let regBlocked = false;
  try {
    await api.rpc("prepare-register-profile", {
      fullname: "Smoke Test", email: `smoke-${Date.now()}@example.invalid`, password: "x".repeat(16),
    });
  } catch (err) {
    regBlocked = !!(err.body && err.body.code === "registration-disabled");
  }
  check(regBlocked, "public registration is disabled");

  if (EMAIL && PASSWORD) {
    step(`Login as ${EMAIL}`);
    try {
      await api.login(EMAIL, PASSWORD);
      const profile = await api.getProfile();
      check(profile && profile.email === EMAIL, "password login works");
    } catch (err) {
      check(false, `password login works (${err.message})`);
    }
  }

  if (BROWSER) {
    step("Browser check (headless Chromium)");
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ executablePath: process.env.FREEGMA_CHROMIUM_PATH || undefined });
    try {
      const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
      await page.goto(`${BASE}/#/auth/login`, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForSelector("#email", { timeout: 30000 });
      const state = await page.evaluate(() => ({
        title: document.title,
        swapped: document.querySelectorAll('symbol[data-freegma="1"]').length,
        badge: (() => {
          const el = document.getElementById("freegma-attribution");
          return el && !el.hidden ? el.textContent : null;
        })(),
      }));
      check(state.swapped >= 3, `Penpot logo symbols replaced (${state.swapped})`);
      check(state.title.includes(BRAND), `window title "${state.title}"`);
      if (SHOW_ATTRIBUTION) {
        check(!!state.badge && /Penpot/.test(state.badge), `attribution visible ("${state.badge || "-"}")`);
      }
    } finally {
      await browser.close();
    }
  }

  if (failures) {
    console.log(`\nSMOKE TEST FAILED (${failures} check${failures > 1 ? "s" : ""})`);
    process.exit(1);
  }
  console.log("\nSMOKE TEST PASSED");
}

main().catch((err) => fail(err));
