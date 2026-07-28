import { config } from "./config.js";

export function parseMcpResponse(text) {
  const events = String(text || "").split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim()).filter(Boolean);
  for (const value of events.reverse()) {
    try { return JSON.parse(value); } catch { /* try the next event */ }
  }
  try { return JSON.parse(String(text || "")); } catch { return null; }
}

export function mcpText(payload) {
  const content = payload?.result?.content;
  if (!Array.isArray(content)) return "";
  return content.filter((item) => item?.type === "text").map((item) => item.text).join("\n").trim();
}

class OmbreClient {
  constructor() { this.sessionId = null; this.callId = 0; }
  get configured() { return Boolean(config.ombre.url); }
  headers(withSession = true) {
    return {
      "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      ...(config.ombre.token ? { Authorization: `Bearer ${config.ombre.token}` } : {}),
      ...(withSession && this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {})
    };
  }
  async post(body, withSession = true) {
    const response = await fetch(`${config.ombre.url}/mcp`, {
      method: "POST", headers: this.headers(withSession), body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.ombre.timeoutMs)
    });
    if (!response.ok) throw new Error(`Ombre MCP ${response.status}`);
    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId) this.sessionId = sessionId;
    return parseMcpResponse(await response.text());
  }
  async initialize() {
    await this.post({ jsonrpc: "2.0", id: ++this.callId, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "lumiere", version: "1.0.0" } } }, false);
    if (!this.sessionId) throw new Error("Ombre MCP did not return a session id");
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
  }
  async call(toolName, args = {}, retry = true) {
    if (!this.configured) return null;
    try {
      if (!this.sessionId) await this.initialize();
      const payload = await this.post({ jsonrpc: "2.0", id: ++this.callId, method: "tools/call", params: { name: toolName, arguments: args } });
      if (payload?.error) throw new Error(payload.error.message || "Ombre tool failed");
      return mcpText(payload);
    } catch (error) {
      this.sessionId = null;
      if (retry) return this.call(toolName, args, false);
      console.error(`[ombre] ${toolName}:`, error.message);
      return null;
    }
  }
  async health() {
    if (!this.configured) return { configured: false, connected: false };
    try {
      const response = await fetch(`${config.ombre.url}/health`, { headers: config.ombre.token ? { Authorization: `Bearer ${config.ombre.token}` } : {}, signal: AbortSignal.timeout(config.ombre.timeoutMs) });
      return { configured: true, connected: response.ok };
    } catch { return { configured: true, connected: false }; }
  }
  recall(query) { return this.call("breath_search", { query, max_results: config.ombre.maxResults }); }
  breathe() { return this.call("breath", {}); }
  catalog() { return this.call("breath_advanced", { catalog: true, max_tokens: config.ombre.catalogMaxTokens }); }
  dream() { return this.call("dream", {}); }
  grow(content) { return this.call("grow", { content }); }
}

export const ombre = new OmbreClient();
