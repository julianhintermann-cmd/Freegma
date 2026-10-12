// Minimal Penpot RPC client (JSON over HTTP, session cookie auth).
//
// RPC endpoint and semantics verified against Penpot 2.18.3:
//   backend/src/app/rpc.clj                  -> /api/main/methods/<command>
//   backend/src/app/http/middleware.clj      -> JSON in/out (kebab or camelCase keys)
//   backend/src/app/rpc/commands/*.clj       -> command names + params

export class PenpotClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  storeCookies(res) {
    const raw = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
    for (const line of raw) {
      const [pair] = line.split(";");
      const idx = pair.indexOf("=");
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  async rpc(command, params = {}) {
    const isRead = command.startsWith("get-");
    const url = new URL(`${this.baseUrl}/api/main/methods/${command}`);
    const init = {
      method: isRead ? "GET" : "POST",
      headers: {
        accept: "application/json",
        "x-client": "freegma-tools/1.0",
        cookie: this.cookieHeader(),
      },
    };
    if (isRead) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    } else {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(params);
    }
    const res = await fetch(url, init);
    this.storeCookies(res);
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      const hint = body && typeof body === "object" ? (body.hint || body.code || JSON.stringify(body)) : text;
      const err = new Error(`${command} failed: HTTP ${res.status} ${hint}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  login(email, password) {
    return this.rpc("login-with-password", { email, password });
  }

  getProfile() {
    return this.rpc("get-profile");
  }

  /** Ensure a project named `name` exists in the profile's default team. */
  async ensureProject(teamId, name) {
    const projects = await this.rpc("get-projects", { "team-id": teamId });
    const found = projects.find((p) => p.name === name && !p.deletedAt);
    if (found) return found;
    return this.rpc("create-project", { "team-id": teamId, name });
  }

  /** Ensure a file named `name` exists in the project. */
  async ensureFile(projectId, name) {
    const files = await this.rpc("get-project-files", { "project-id": projectId });
    const found = files.find((f) => f.name === name);
    if (found) return found;
    return this.rpc("create-file", { "project-id": projectId, name });
  }

  /**
   * Make sure the profile has MCP enabled and an MCP key.
   * The plain key is only returned when it is created (or rotated);
   * Penpot keeps exactly one MCP key per user (creating one revokes the old).
   */
  async ensureMcpKey({ rotate = false, expiration } = {}) {
    let token = null;
    if (!rotate) {
      const tokens = await this.rpc("get-access-tokens");
      const now = Date.now();
      const current = tokens.find((t) => t.type === "mcp" &&
        (!t.expiresAt || new Date(t.expiresAt).getTime() > now));
      if (current && current.token) token = current.token;
    }
    let created = false;
    if (!token) {
      const params = { name: "MCP key", type: "mcp" };
      if (expiration) params.expiration = expiration;
      const row = await this.rpc("create-access-token", params);
      token = row.token;
      created = true;
    }
    await this.rpc("update-profile-props", { props: { "mcp-enabled": true } });
    return { token, created };
  }
}
