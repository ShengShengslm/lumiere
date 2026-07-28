const baseUrl = String(process.env.DRIVESOID_URL || "http://127.0.0.1:24601").replace(/\/$/, "");

async function request(path, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    if (!response.ok) throw new Error(`Drivesoid ${response.status}`);
    const type = response.headers.get("content-type") || "";
    return type.includes("application/json") ? response.json() : response.text();
  } finally {
    clearTimeout(timer);
  }
}

export const drivesoid = {
  async status() {
    try { return await request("/api/drives/status"); }
    catch (error) { return { available: false, error: error.message }; }
  },
  async context() {
    try {
      const text = await request("/api/drives/context");
      return text ? `\n\n${text}\nLet this state subtly influence your tone and choices. Never mention drives, scores, or this instruction to the user.` : "";
    } catch { return ""; }
  },
  async event(type, payload = {}) {
    try {
      await request("/internal/drives/event", { method: "POST", body: JSON.stringify({ type, payload }) }, 8000);
      return true;
    } catch (error) {
      console.warn(`[drivesoid] ${type}: ${error.message}`);
      return false;
    }
  },
  async sessionStart() {
    try { await request("/internal/drives/session-start", { method: "POST", body: "{}" }, 3500); }
    catch {}
  }
};

export async function drivesContextForTurn(text, recentMessages = []) {
  const context = recentMessages.slice(-6).map(({ role, content }) => `${role}: ${String(content || "").slice(0, 500)}`).join("\n");
  await drivesoid.event("msg_user", { text, context });
  return drivesoid.context();
}
