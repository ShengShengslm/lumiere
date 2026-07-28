import { config } from "./config.js";

const now = () => new Date().toISOString();
const defaults = {
  id: 1,
  system_prompt: "你是 Lumière，一位温柔、真诚且尊重边界的长期陪伴者。先理解对方，再简洁回应；不要假装拥有现实世界的身体或经历。",
  temperature: 0.8,
  max_context_rounds: 20,
  max_context_tokens: 12000,
  compress_threshold: 9000,
  compress_keep_rounds: 6,
  max_reply_tokens: 1200,
  updated_at: now()
};

class MemoryStore {
  constructor() {
    this.sessions = [];
    this.messages = [];
    this.memories = [];
    this.settings = { ...defaults };
    this.ids = { sessions: 1, messages: 1, memories: 1 };
  }
  async listSessions() { return [...this.sessions].sort((a, b) => b.updated_at.localeCompare(a.updated_at)); }
  async createSession(name = "新的对话") {
    const row = { id: this.ids.sessions++, name, created_at: now(), updated_at: now() };
    this.sessions.push(row); return row;
  }
  async updateSession(id, values) {
    const row = this.sessions.find((item) => item.id === id); if (!row) return null;
    Object.assign(row, values, { updated_at: now() }); return row;
  }
  async deleteSession(id) {
    this.sessions = this.sessions.filter((item) => item.id !== id);
    this.messages = this.messages.filter((item) => item.session_id !== id);
    return true;
  }
  async listMessages(sessionId, visibleOnly = true) {
    return this.messages.filter((item) => item.session_id === sessionId && (!visibleOnly || item.visible)).sort((a, b) => a.id - b.id);
  }
  async addMessage(sessionId, role, content, reasoningContent = null) {
    const row = { id: this.ids.messages++, session_id: sessionId, role, content, reasoning_content: reasoningContent, visible: true, created_at: now() };
    this.messages.push(row); await this.updateSession(sessionId, {}); return row;
  }
  async hideMessages(ids) { this.messages.forEach((item) => { if (ids.includes(item.id)) item.visible = false; }); }
  async clearMessages(sessionId) { this.messages.forEach((item) => { if (item.session_id === sessionId) item.visible = false; }); }
  async listMemories(sessionId) { return this.memories.filter((item) => item.session_id === sessionId).sort((a, b) => b.id - a.id); }
  async listAllMemories() {
    return [...this.memories].filter((item) => !["moment", "diary"].includes(item.metadata?.source))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((item) => ({ ...item, sessions: { name: this.sessions.find((session) => session.id === item.session_id)?.name || "已删除的对话" } }));
  }
  async addMemory(sessionId, summary, metadata = {}) {
    const row = { id: this.ids.memories++, session_id: sessionId, summary, metadata, created_at: now() };
    this.memories.push(row); return row;
  }
  async updateMemory(id, summary) {
    const row = this.memories.find((item) => item.id === id);
    if (!row) return null;
    row.summary = summary;
    return { ...row };
  }
  async listMomentRows() { return this.memories.filter((item) => item.metadata?.source === "moment").sort((a, b) => b.created_at.localeCompare(a.created_at)); }
  async addMomentRow(sessionId, value) { return this.addMemory(sessionId, JSON.stringify(value), { source: "moment", name: "朋友圈" }); }
  async updateMomentRow(id, value) { return this.updateMemory(id, JSON.stringify(value)); }
  async listDiaryRows() { return this.memories.filter((item) => item.metadata?.source === "diary").sort((a, b) => b.created_at.localeCompare(a.created_at)); }
  async addDiaryRow(sessionId, value) { return this.addMemory(sessionId, value.content, { source: "diary", name: value.title, diary_date: value.date, visible: value.visible }); }
  async updateDiaryRow(id, value) {
    const row = this.memories.find((item) => item.id === id);
    if (!row) return null;
    if (value.content !== undefined) row.summary = value.content;
    row.metadata = { ...row.metadata, ...(value.title !== undefined ? { name: value.title } : {}), ...(value.visible !== undefined ? { visible: value.visible } : {}) };
    return { ...row };
  }
  async getSettings() { return { ...this.settings }; }
  async updateSettings(values) { Object.assign(this.settings, values, { id: 1, updated_at: now() }); return this.getSettings(); }
}

class SupabaseStore {
  async request(path, { method = "GET", body, prefer } = {}) {
    const headers = {
      apikey: config.supabaseKey,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {})
    };
    // New sb_secret_/sb_publishable_ keys are opaque API keys, not JWTs.
    // Sending them as Bearer tokens makes hosted Supabase reject the request.
    if (!/^sb_(?:secret|publishable)_/.test(config.supabaseKey)) {
      headers.Authorization = `Bearer ${config.supabaseKey}`;
    }
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
    if (response.status === 204) return null;
    const text = await response.text(); return text ? JSON.parse(text) : null;
  }
  async listSessions() { return this.request("sessions?select=*&order=updated_at.desc"); }
  async createSession(name = "新的对话") { return (await this.request("sessions", { method: "POST", body: { name }, prefer: "return=representation" }))[0]; }
  async updateSession(id, values) { return (await this.request(`sessions?id=eq.${id}`, { method: "PATCH", body: { ...values, updated_at: now() }, prefer: "return=representation" }))[0] || null; }
  async deleteSession(id) { await this.request(`sessions?id=eq.${id}`, { method: "DELETE" }); return true; }
  async listMessages(sessionId, visibleOnly = true) { return this.request(`messages?session_id=eq.${sessionId}${visibleOnly ? "&visible=eq.true" : ""}&select=*&order=id.asc`); }
  async addMessage(sessionId, role, content, reasoningContent = null) { return (await this.request("messages", { method: "POST", body: { session_id: sessionId, role, content, reasoning_content: reasoningContent }, prefer: "return=representation" }))[0]; }
  async hideMessages(ids) { if (ids.length) await this.request(`messages?id=in.(${ids.join(",")})`, { method: "PATCH", body: { visible: false } }); }
  async clearMessages(sessionId) { await this.request(`messages?session_id=eq.${sessionId}`, { method: "PATCH", body: { visible: false } }); }
  async listMemories(sessionId) { return this.request(`memories?session_id=eq.${sessionId}&select=*&order=id.desc`); }
  async listAllMemories() {
    const rows = await this.request("memories?select=id,session_id,summary,metadata,created_at,sessions(name)&order=created_at.desc");
    return rows.filter((item) => !["moment", "diary"].includes(item.metadata?.source));
  }
  async addMemory(sessionId, summary, metadata = {}) { return (await this.request("memories", { method: "POST", body: { session_id: sessionId, summary, metadata }, prefer: "return=representation" }))[0]; }
  async updateMemory(id, summary) { return (await this.request(`memories?id=eq.${id}`, { method: "PATCH", body: { summary }, prefer: "return=representation" }))[0] || null; }
  async listMomentRows() {
    const rows = await this.request("memories?select=id,session_id,summary,metadata,created_at&order=created_at.desc");
    return rows.filter((item) => item.metadata?.source === "moment");
  }
  async addMomentRow(sessionId, value) { return this.addMemory(sessionId, JSON.stringify(value), { source: "moment", name: "朋友圈" }); }
  async updateMomentRow(id, value) { return this.updateMemory(id, JSON.stringify(value)); }
  async listDiaryRows() {
    const rows = await this.request("memories?metadata->>source=eq.diary&select=id,session_id,summary,metadata,created_at&order=created_at.desc");
    return rows;
  }
  async addDiaryRow(sessionId, value) { return this.addMemory(sessionId, value.content, { source: "diary", name: value.title, diary_date: value.date, visible: value.visible }); }
  async updateDiaryRow(id, value) {
    const rows = await this.request(`memories?id=eq.${id}&select=id,session_id,summary,metadata,created_at`);
    const row = rows[0];
    if (!row) return null;
    const body = {
      ...(value.content !== undefined ? { summary: value.content } : {}),
      metadata: { ...row.metadata, ...(value.title !== undefined ? { name: value.title } : {}), ...(value.visible !== undefined ? { visible: value.visible } : {}) }
    };
    return (await this.request(`memories?id=eq.${id}`, { method: "PATCH", body, prefer: "return=representation" }))[0] || null;
  }
  async getSettings() { const rows = await this.request("settings?id=eq.1&select=*"); return rows[0] || defaults; }
  async updateSettings(values) { return (await this.request("settings?id=eq.1", { method: "PATCH", body: { ...values, updated_at: now() }, prefer: "return=representation" }))[0]; }
}

export const store = config.supabaseUrl && config.supabaseKey ? new SupabaseStore() : new MemoryStore();
export { MemoryStore, defaults };
