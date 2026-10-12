/*
 * Freegma: keep Penpot's MCP plugin alive in background tabs.
 *
 * Injected by the branding proxy into the MCP plugin page
 * (/plugins/mcp/index.html, runs in an iframe inside the Penpot tab) before
 * the plugin's own code.
 *
 * Why: the plugin sends a heartbeat to the MCP server every 10 s via
 * setInterval; the server rejects tool calls when no heartbeat arrived for
 * 30 s (penpot/mcp: plugin/src/main.ts, server/src/PluginBridge.ts @ 2.18.3).
 * Browsers throttle timers in hidden tabs - Chrome/Edge to one wake-up per
 * minute after 5 minutes - so Claude would see "the Penpot tab appears to be
 * suspended" unless the tab stays in the foreground.
 *
 * How: intervals of >= 1 s are driven by a Web Worker; worker messages are
 * not subject to background timer throttling. The plugin also holds a Web
 * Lock while open, which asks browsers not to freeze/discard the tab.
 */
(function () {
  "use strict";
  if (window.__freegmaWorkerTimers || typeof Worker !== "function") return;

  var workerSource =
    "var t={};onmessage=function(e){var d=e.data;" +
    "if(d.c==='set'){t[d.id]=setInterval(function(){postMessage(d.id)},d.ms)}" +
    "else{clearInterval(t[d.id]);delete t[d.id]}};";

  var worker;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" })));
  } catch (e) {
    return; // keep the browser's own timers
  }

  var nativeSetInterval = window.setInterval.bind(window);
  var nativeClearInterval = window.clearInterval.bind(window);
  var callbacks = {};
  var nextId = 1;

  worker.onmessage = function (event) {
    var entry = callbacks[event.data];
    if (!entry) return;
    try {
      entry.fn.apply(window, entry.args);
    } catch (err) {
      setTimeout(function () { throw err; });
    }
  };

  window.setInterval = function (fn, ms) {
    if (typeof fn !== "function" || !(Number(ms) >= 1000)) {
      return nativeSetInterval.apply(window, arguments);
    }
    var id = "freegma-" + nextId++;
    callbacks[id] = { fn: fn, args: Array.prototype.slice.call(arguments, 2) };
    worker.postMessage({ c: "set", id: id, ms: Number(ms) });
    return id;
  };

  window.clearInterval = function (id) {
    if (typeof id === "string" && callbacks[id]) {
      delete callbacks[id];
      worker.postMessage({ c: "clear", id: id });
      return;
    }
    return nativeClearInterval(id);
  };

  // Ask the browser not to freeze or discard this tab while the plugin runs.
  try {
    if (navigator.locks && navigator.locks.request) {
      navigator.locks.request("freegma-mcp-keepalive", function () {
        return new Promise(function () {});
      });
    }
  } catch (e) { /* not supported - harmless */ }

  window.__freegmaWorkerTimers = true;
})();
