/*
 * Freegma runtime branding for the Penpot web app.
 *
 * Loaded (synchronously) from <head> by the branding proxy. `window.FREEGMA`
 * is prepended by the container entrypoint with the configured brand name,
 * logos and links.
 *
 * What it does - without touching Penpot's code:
 *   1. swaps Penpot's logo <symbol>s in the inline SVG sprite for Freegma's
 *      (every <use href="#..."> in the app updates automatically),
 *   2. rewrites "Penpot" in the window title (any UI language),
 *   3. shows the "Freegma - based on Penpot (MPL-2.0)" attribution on the
 *      login, dashboard and settings screens,
 *   4. hardens Penpot's plugin sandbox against the SES "override mistake"
 *      (see sesOverrideTaming below),
 *   5. adds ready-to-paste MCP client configs (with the user's key) to
 *      Settings -> Integrations.
 *
 * Penpot internals this relies on are listed in docs/BRANDING.md.
 */
(function () {
  "use strict";

  var F = window.FREEGMA || {};
  var BRAND = F.name || "Freegma";

  // ------------------------------------------------------- plugin sandbox --
  // Penpot's plugin runtime (used by the MCP plugin) runs SES `lockdown`,
  // which freezes JavaScript built-ins. With SES' default "moderate" override
  // taming, any later `obj.toString = ...` (by a library, a browser
  // extension or newer browser code) throws - in Firefox:
  //   TypeError: "toString" is read-only   -> Penpot's "Internal Error" page.
  // "severe" taming makes every frozen built-in property overridable again.
  // SES reads this option from globalThis.process.env when Penpot's libs.js
  // initialises (verified for Penpot 2.18.3: libs.js -> getEnvironmentOption).
  // libs.js itself also assigns `window.process = {cwd: ...}` while loading,
  // so instead of a one-off shim we keep an accessor that adds our env entry
  // to whatever object is stored there. Everything else stays untouched.
  var taming = F.sesOverrideTaming || "severe";
  if (taming !== "off") {
    try {
      var sesEnv = { LOCKDOWN_OVERRIDE_TAMING: taming };
      var withEnv = function (value) {
        if (value && typeof value === "object") {
          var env = value.env && typeof value.env === "object" ? value.env : {};
          if (!("LOCKDOWN_OVERRIDE_TAMING" in env)) env.LOCKDOWN_OVERRIDE_TAMING = sesEnv.LOCKDOWN_OVERRIDE_TAMING;
          value.env = env;
        }
        return value;
      };
      var current = withEnv(globalThis.process || { env: sesEnv });
      Object.defineProperty(globalThis, "process", {
        configurable: true,
        enumerable: false,
        get: function () { return current; },
        set: function (value) { current = withEnv(value); },
      });
    } catch (e) { /* leave Penpot's defaults */ }
  }

  // Penpot 2.18 starts a plugin (e.g. the MCP plugin, automatically when a
  // file opens) with `harden(pluginApi)` *before* it calls
  // `hardenIntrinsics()`. harden() freezes Object.prototype and
  // Function.prototype on the way, so SES can no longer turn their
  // `toString`/`valueOf`/... into overridable accessors. From then on every
  // plain `obj.toString = fn` in the app throws (Firefox: "toString" is
  // read-only) and Penpot shows "Internal Error". Fix: make the first
  // harden() run hardenIntrinsics() first - the order SES documents - and
  // make hardenIntrinsics() idempotent for Penpot's own later call.
  // (libs.js -> kZt: In.harden(n) before OZt -> In.hardenIntrinsics()).
  function fixHardenOrder() {
    var g = globalThis;
    if (g.__freegmaHardenOrder) return true;
    var hardenIntrinsics = g.hardenIntrinsics;
    var harden = g.harden;
    if (typeof hardenIntrinsics !== "function" || typeof harden !== "function") return false;
    var done = false;
    var once = function () {
      if (done) return undefined;
      done = true;
      return hardenIntrinsics.apply(this, arguments);
    };
    try {
      g.hardenIntrinsics = once;
      g.harden = function (value) {
        once();
        return harden(value);
      };
    } catch (e) { /* not writable - leave Penpot's defaults */ }
    g.__freegmaHardenOrder = true;
    return true;
  }
  if (taming !== "off" && !fixHardenOrder()) {
    // libs.js installs harden/hardenIntrinsics (SES repairIntrinsics) while
    // loading, i.e. after this script and long before a plugin can start.
    document.addEventListener("DOMContentLoaded", fixHardenOrder);
  }

  // Sprite symbols that carry the Penpot logo (Penpot 2.18).
  var WORDMARK_SYMBOLS = ["asset-penpot-logo", "icon-penpot-logo"];
  var ICON_SYMBOLS = [
    "icon-penpot-logo-icon",
    "asset-penpot-logo-icon",
    "icon-penpot-logo-icon-loader",
  ];

  // ---------------------------------------------------------------- logos --
  function parseSvg(markup) {
    if (!markup) return null;
    var tpl = document.createElement("template");
    tpl.innerHTML = String(markup).trim();
    return tpl.content.querySelector("svg");
  }

  function replaceSymbol(id, svg) {
    var symbol = document.getElementById(id);
    if (!symbol || !svg || symbol.getAttribute("data-freegma") === "1") {
      return !!(symbol && symbol.getAttribute("data-freegma") === "1");
    }
    var viewBox = svg.getAttribute("viewBox");
    if (viewBox) symbol.setAttribute("viewBox", viewBox);
    symbol.removeAttribute("fill");
    while (symbol.firstChild) symbol.removeChild(symbol.firstChild);
    for (var i = 0; i < svg.childNodes.length; i++) {
      symbol.appendChild(document.importNode(svg.childNodes[i], true));
    }
    symbol.setAttribute("data-freegma", "1");
    return true;
  }

  function applyLogos() {
    var wordmark = parseSvg(F.logo);
    var icon = parseSvg(F.icon);
    var done = 0;
    WORDMARK_SYMBOLS.forEach(function (id) {
      if (replaceSymbol(id, wordmark)) done++;
    });
    ICON_SYMBOLS.forEach(function (id) {
      if (replaceSymbol(id, icon)) done++;
    });
    return done;
  }

  window.freegmaApplyLogos = applyLogos;

  // ---------------------------------------------------------------- title --
  function rebrandTitle() {
    var title = document.title || "";
    var next = title
      .replace(/^Penpot(\s[|-]\s.*)?$/, function () { return BRAND; })
      .replace(/(\s[-|–]\s)Penpot$/, function (_, sep) { return sep + BRAND; });
    if (next !== title) document.title = next;
  }

  function watchTitle() {
    rebrandTitle();
    var head = document.head || document.querySelector("head");
    if (!head || !window.MutationObserver) return;
    new MutationObserver(rebrandTitle).observe(head, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }

  // ---------------------------------------------------------- attribution --
  var badge = null;

  function currentRoute() {
    // Penpot uses hash routing: #/auth/login, #/dashboard/..., #/workspace?...
    var hash = (window.location.hash || "").replace(/^#\/?/, "");
    return hash.split(/[/?]/)[0];
  }

  function link(href, text, cls) {
    var a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = text;
    if (cls) a.className = cls;
    return a;
  }

  function buildBadge() {
    var el = document.createElement("div");
    el.id = "freegma-attribution";
    el.setAttribute("role", "contentinfo");
    var penpotSrc =
      "https://github.com/penpot/penpot" +
      (F.penpotVersion ? "/tree/" + encodeURIComponent(F.penpotVersion) : "");
    el.appendChild(link("/freegma/about.html", BRAND, "freegma-brand"));
    el.appendChild(document.createTextNode(" – based on "));
    el.appendChild(link("https://penpot.app", "Penpot"));
    el.appendChild(document.createTextNode(" ("));
    el.appendChild(link(penpotSrc, "MPL-2.0"));
    el.appendChild(document.createTextNode(")"));
    if (F.sourceUrl) {
      el.appendChild(document.createTextNode(" · "));
      el.appendChild(link(F.sourceUrl, "Source"));
    }
    return el;
  }

  function updateBadge() {
    if (!F.showAttribution || !document.body) return;
    if (!badge) {
      badge = buildBadge();
      document.body.appendChild(badge);
    }
    var route = currentRoute();
    badge.setAttribute("data-route", route);
    // Never cover the canvas / viewer.
    badge.hidden = !(route === "" || route === "auth" ||
                     route === "dashboard" || route === "settings");
  }

  // ------------------------------------------------------ MCP client setup --
  // Settings -> Integrations shows the personal MCP server URL (with the
  // user's key) in a read-only input. Below it we add ready-to-paste client
  // configs built from exactly that URL, so nobody has to assemble JSON by
  // hand. Nothing is stored or sent anywhere; the key never leaves the page.
  var MCP_BOX_ID = "freegma-mcp-config";
  var mcpTab = "claude-code";
  var mcpUrlShown = null;
  var mcpFreshKey = null;

  function mcpSnippets(url) {
    return [
      {
        id: "claude-code",
        label: "Claude Code",
        hint: "Run once in a terminal. --scope user makes it available in every project.",
        code: 'claude mcp add --transport http --scope user freegma "' + url + '"',
      },
      {
        id: "claude-desktop",
        label: "Claude Desktop",
        hint: "Settings → Developer → Edit Config (claude_desktop_config.json), then restart Claude. Needs Node.js.",
        code: JSON.stringify({
          mcpServers: { freegma: { command: "npx", args: ["-y", "mcp-remote@0.14.3", url] } },
        }, null, 2),
      },
      {
        id: "cursor",
        label: "Cursor & others",
        hint: "For clients that speak remote / streamable-HTTP MCP, e.g. ~/.cursor/mcp.json.",
        code: JSON.stringify({ mcpServers: { freegma: { url: url } } }, null, 2),
      },
    ];
  }

  function copyText(text, button) {
    var done = function () {
      var old = button.getAttribute("data-label") || button.textContent;
      button.setAttribute("data-label", old);
      button.textContent = "Copied";
      setTimeout(function () { button.textContent = old; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text); done();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  function ensureMcpStyles() {
    if (document.getElementById("freegma-mcp-style")) return;
    var css =
      "#" + MCP_BOX_ID + "{margin-top:16px;padding:16px;border-radius:8px;border:1px solid var(--color-background-quaternary,#2e3434);background:var(--color-background-tertiary,#212426);font-size:12px;color:var(--color-foreground-secondary,#8f9da3)}" +
      "#" + MCP_BOX_ID + " h4{margin:0 0 4px;font-size:14px;font-weight:500;color:var(--color-foreground-primary,#fff)}" +
      "#" + MCP_BOX_ID + " .fg-tabs{display:flex;gap:4px;margin:12px 0 8px;flex-wrap:wrap}" +
      "#" + MCP_BOX_ID + " .fg-tab{padding:6px 10px;border-radius:6px;border:1px solid transparent;background:transparent;color:inherit;font:inherit;cursor:pointer}" +
      "#" + MCP_BOX_ID + " .fg-tab[aria-selected=true]{background:var(--color-background-quaternary,#2e3434);color:var(--color-foreground-primary,#fff);border-color:var(--freegma-accent,#ff8a5c)}" +
      "#" + MCP_BOX_ID + " pre{position:relative;margin:8px 0 0;padding:12px 12px 12px 12px;border-radius:6px;background:var(--color-background-primary,#18191a);color:var(--color-foreground-primary,#fff);font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-all;max-height:260px;overflow:auto}" +
      "#" + MCP_BOX_ID + " .fg-copy{margin-top:8px;padding:6px 12px;border:none;border-radius:6px;background:var(--freegma-accent,#ff8a5c);color:#1b1311;font:inherit;font-weight:600;cursor:pointer}" +
      "#" + MCP_BOX_ID + " .fg-warn{margin-top:10px}";
    var style = document.createElement("style");
    style.id = "freegma-mcp-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function renderMcpBox(box, url) {
    var snippets = mcpSnippets(url);
    var current = snippets.filter(function (s) { return s.id === mcpTab; })[0] || snippets[0];
    while (box.firstChild) box.removeChild(box.firstChild);

    var title = document.createElement("h4");
    title.textContent = "Connect your AI client";
    box.appendChild(title);
    var intro = document.createElement("div");
    intro.textContent = "Ready-to-paste configuration with your personal MCP key.";
    box.appendChild(intro);

    var tabs = document.createElement("div");
    tabs.className = "fg-tabs";
    tabs.setAttribute("role", "tablist");
    snippets.forEach(function (s) {
      var tab = document.createElement("button");
      tab.type = "button";
      tab.className = "fg-tab";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(s.id === current.id));
      tab.textContent = s.label;
      tab.addEventListener("click", function () { mcpTab = s.id; renderMcpBox(box, url); });
      tabs.appendChild(tab);
    });
    box.appendChild(tabs);

    var hint = document.createElement("div");
    hint.textContent = current.hint;
    box.appendChild(hint);
    var pre = document.createElement("pre");
    pre.textContent = current.code;
    box.appendChild(pre);
    var copy = document.createElement("button");
    copy.type = "button";
    copy.className = "fg-copy";
    copy.textContent = "Copy";
    copy.addEventListener("click", function () { copyText(current.code, copy); });
    box.appendChild(copy);
    var warn = document.createElement("div");
    warn.className = "fg-warn";
    warn.textContent = "Treat this like a password: anyone with it can edit the file open in your Freegma tab. Regenerate the key above if it leaks.";
    box.appendChild(warn);
  }

  function updateMcpConfig() {
    var input = null;
    var inputs = document.querySelectorAll("input[readonly]");
    for (var i = 0; i < inputs.length; i++) {
      var v = inputs[i].value || "";
      if (/\/mcp\/stream\?userToken=/.test(v)) { if (!input) input = inputs[i]; continue; }
      // "MCP key regenerated/created" dialog: Penpot shows the new key there,
      // but keeps the old server URL on the page until it is reloaded.
      var modal = inputs[i].closest('[class*="modal"]');
      if (modal && /MCP/.test(modal.textContent || "") && /^[A-Za-z0-9._~-]{40,}$/.test(v)) mcpFreshKey = v;
    }
    var url = input ? input.value : null;
    if (url && mcpFreshKey) url = url.replace(/userToken=[^&]*/, "userToken=" + mcpFreshKey);
    var box = document.getElementById(MCP_BOX_ID);
    if (!url) {
      if (box) box.parentNode.removeChild(box);
      mcpUrlShown = null;
      return;
    }
    if (box && mcpUrlShown === url && document.body.contains(box)) return;
    var anchor = input.closest('[class*="notification-pill"]') || input.closest('[class*="input-copy"]') || input.parentNode;
    if (!box) {
      ensureMcpStyles();
      box = document.createElement("section");
      box.id = MCP_BOX_ID;
    }
    if (box.previousSibling !== anchor) anchor.parentNode.insertBefore(box, anchor.nextSibling);
    mcpUrlShown = url;
    renderMcpBox(box, url);
  }

  // ----------------------------------------------------------------- boot --
  function onReady() {
    applyLogos();
    watchTitle();
    onNavigate();
  }

  // Penpot's router does not always fire "hashchange" (it also uses the
  // History API), so watch both and keep a cheap poll as a safety net.
  var lastRoute = null;
  function onNavigate() {
    var route = currentRoute();
    // Re-run until the badge exists (document.body may not be ready yet).
    if (route === lastRoute && (badge || !F.showAttribution)) return;
    lastRoute = route;
    updateBadge();
    rebrandTitle();
  }
  ["pushState", "replaceState"].forEach(function (name) {
    var original = window.history[name];
    if (typeof original !== "function") return;
    window.history[name] = function () {
      var result = original.apply(this, arguments);
      setTimeout(onNavigate, 0);
      return result;
    };
  });
  window.addEventListener("hashchange", onNavigate);
  window.addEventListener("popstate", onNavigate);
  setInterval(function () {
    onNavigate();
    // Integrations page: (re)build the MCP client configs, also after the
    // key was regenerated. Cheap no-op on every other route.
    if (currentRoute() === "settings") updateMcpConfig();
    else if (mcpUrlShown) updateMcpConfig();
  }, 1000);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();
