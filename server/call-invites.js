import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import { store } from "./store.js";
import { chat } from "./model.js";
import { sendCallBark } from "./shadow-push.js";
import { sendCallWebPush } from "./web-push.js";

const statePath = join(process.cwd(), "data", "call-invites.json");
let checking = false;

function load() {
  try { if (existsSync(statePath)) return JSON.parse(readFileSync(statePath, "utf8")); } catch {}
  return { invite: null, lastCallDate: "" };
}

const state = load();
function save() {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state));
}

function publicInvite() {
  if (!state.invite) return null;
  if (state.invite.status === "pending" && Date.now() > Date.parse(state.invite.expires_at)) {
    state.invite.status = "missed";
    save();
    void store.addMessage(state.invite.session_id, "assistant", `📞 未接来电\n${state.invite.reason}`).catch(() => {});
  }
  return state.invite;
}

function activeSelection() {
  if (config.push.modelSelection) return config.push.modelSelection;
  const provider = config.providers.find((item) => item.apiKey && item.models.length);
  return provider ? `${provider.id}:${provider.models[0].id}` : "";
}

export function getCallInvite() {
  const invite = publicInvite();
  return invite?.status === "pending" ? invite : null;
}

export async function answerCallInvite({ id, action, note = "" }) {
  const invite = publicInvite();
  if (!invite || invite.id !== id || invite.status !== "pending") return null;
  invite.status = action === "accept" ? "accepted" : "declined";
  invite.resolved_at = new Date().toISOString();
  save();
  if (invite.status === "declined" && note.trim()) {
    await store.addMessage(invite.session_id, "user", `现在不方便接电话：${note.trim().slice(0, 120)}`);
  }
  return invite;
}

export async function saveCallRecord({ sessionId, seconds }) {
  const safeSeconds = Math.max(1, Math.min(24 * 3600, Math.round(Number(seconds) || 0)));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  const label = minutes ? `${minutes}分${rest ? `${rest}秒` : ""}` : `${rest}秒`;
  return store.addMessage(sessionId, "assistant", `📞 与顾克通话 · ${label}`);
}

export async function maybeCreateProactiveCall({ force = false } = {}) {
  if (checking) return { created: false, reason: "locked" };
  checking = true;
  try {
    if (getCallInvite()) return { created: false, reason: "pending" };
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", hour12: false }).format(new Date()));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
    if (!force && (hour < 12 || hour >= 23)) return { created: false, reason: "hours" };
    if (!force && state.lastCallDate === today) return { created: false, reason: "daily_limit" };
    const sessions = await store.listSessions();
    const session = sessions[0];
    if (!session) return { created: false, reason: "no_session" };
    const history = await store.listMessages(session.id, true);
    const lastUser = [...history].reverse().find((item) => item.role === "user");
    const silentHours = lastUser ? (Date.now() - Date.parse(lastUser.created_at)) / 3_600_000 : Infinity;
    if (!force && silentHours < 5) return { created: false, reason: "not_silent", silentHours };
    let reason = "有一点想你，想听听你的声音。";
    const selection = activeSelection();
    if (selection) {
      try {
        const settings = await store.getSettings();
        const recent = history.slice(-10).map(({ role, content }) => ({ role, content }));
        const result = await chat({
          messages: [...recent, { role: "user", content: "<system_trigger>你决定主动给用户打一通电话。只写来电页面显示的一句简短理由，25字以内，不要引号、Markdown或解释。</system_trigger>" }],
          system: settings.system_prompt,
          selection, temperature: 0.9, maxTokens: 80, allowTools: false
        });
        const generated = String(result.content || "").replace(/[*_#>`"]/g, "").trim().slice(0, 50);
        if (generated) reason = generated;
      } catch (error) { console.warn("[call] reason generation:", error.message); }
    }
    state.invite = {
      id: `call-${Date.now()}`, session_id: session.id, reason, status: "pending",
      created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString()
    };
    state.lastCallDate = today;
    save();
    let webPush = { configured: false, delivered: 0, failed: 0 };
    try { webPush = await sendCallWebPush({ inviteId: state.invite.id, reason }); }
    catch (error) { console.warn("[call] web push:", error.message); }
    let bark = { configured: false, delivered: false };
    if (!webPush.delivered) {
      try { bark = await sendCallBark(reason); } catch (error) { console.warn("[call] bark:", error.message); }
    }
    return { created: true, invite: state.invite, webPush, bark };
  } finally { checking = false; }
}
