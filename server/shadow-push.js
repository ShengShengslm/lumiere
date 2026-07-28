import { config } from "./config.js";
import { store } from "./store.js";
import { chat } from "./model.js";
import { ombre } from "./ombre.js";

let pushLock = false;

export function cleanPushReply(value, hardLimit = 120) {
  const cleaned = String(value || "")
    .replace(/<reasoning_summary>[\s\S]*?<\/reasoning_summary>/gi, "")
    .replace(/<\/?(?:answer|reasoning_summary)>/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(cleaned);
  if (chars.length <= hardLimit) return cleaned;
  const head = chars.slice(0, hardLimit);
  const ends = new Set(["。", "！", "？", "…", "～", "!", "?", "."]);
  let cut = -1;
  for (let index = head.length - 1; index >= 0; index -= 1) {
    if (ends.has(head[index])) { cut = index; break; }
  }
  return head.slice(0, cut >= 0 ? cut + 1 : hardLimit).join("").trim();
}

export function cooldownDecision(lastMessageAt, now = Date.now(), random = Math.random) {
  const min = Math.max(1, config.push.cooldownMinMinutes);
  const max = Math.max(min, config.push.cooldownMaxMinutes);
  const cooldownMinutes = min + Math.floor(random() * (max - min + 1));
  const elapsedMinutes = lastMessageAt ? (now - new Date(lastMessageAt).getTime()) / 60000 : Infinity;
  return { shouldPush: elapsedMinutes >= cooldownMinutes, cooldownMinutes, elapsedMinutes };
}

function selection() {
  if (config.push.modelSelection) return config.push.modelSelection;
  const provider = config.providers.find((item) => item.apiKey && item.models.length);
  if (!provider) throw new Error("没有可用于主动消息的模型");
  return `${provider.id}:${provider.models[0].id}`;
}

async function memoryContext(sessionId, query) {
  const [localMemories, recalled] = await Promise.all([
    store.listMemories(sessionId),
    ombre.configured ? ombre.recall(query) : null
  ]);
  const parts = [];
  if (localMemories[0]?.summary) parts.push(`长期对话摘要：\n${localMemories[0].summary.slice(0, 1200)}`);
  if (recalled) parts.push(`Ombre Brain 召回的相关经历：\n${recalled.slice(0, 2200)}`);
  return parts.length ? `\n\n${parts.join("\n\n")}` : "";
}

async function sendBark(body) {
  if (!config.push.barkUrl) return { configured: false, delivered: false };
  const response = await fetch(config.push.barkUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      title: config.push.title,
      body,
      group: "lumiere",
      level: "active",
      badge: 1,
      url: config.push.publicAppUrl,
      icon: config.push.iconUrl
    }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Bark ${response.status}`);
  return { configured: true, delivered: true };
}

export async function sendCallBark(reason) {
  if (!config.push.barkUrl) return { configured: false, delivered: false };
  const response = await fetch(config.push.barkUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      title: "顾克来电",
      body: reason,
      group: "lumiere-call",
      level: "timeSensitive",
      call: "1",
      badge: 1,
      url: config.push.publicAppUrl,
      icon: config.push.iconUrl
    }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Bark ${response.status}`);
  return { configured: true, delivered: true };
}

export async function generateShadowPush({ force = false } = {}) {
  if (pushLock) return { pushed: false, reason: "locked" };
  pushLock = true;
  try {
    const sessions = await store.listSessions();
    const session = sessions[0];
    if (!session) return { pushed: false, reason: "no_session" };
    const history = await store.listMessages(session.id, true);
    const lastMessage = history.at(-1);
    const decision = cooldownDecision(lastMessage?.created_at);
    if (!force && !decision.shouldPush) {
      return { pushed: false, reason: "cooldown", cooldownMinutes: decision.cooldownMinutes, elapsedMinutes: Math.floor(decision.elapsedMinutes) };
    }

    const settings = await store.getSettings();
    const recent = history.slice(-16).map(({ role, content }) => ({ role, content }));
    const lastUserText = [...history].reverse().find((item) => item.role === "user")?.content || "最近的相处";
    const memories = await memoryContext(session.id, lastUserText);
    const shanghaiNow = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", dateStyle: "full", timeStyle: "short"
    }).format(new Date());
    const shadow = `<system_trigger>
这是一次由系统触发的主动消息，不是用户刚刚发来的内容。
当前上海时间：${shanghaiNow}。
请延续真实聊天的情绪和关系，自然地自己浮上来说一句话。优先参考最近对话和记忆。
可以想念、粘人、轻轻闹她、关心一件具体小事或留一句陪伴；不要总围绕“为什么不回复”。
只写 1-2 句，不超过 80 个中文字符，不用 Markdown，不要冒充用户，不要解释这是自动推送。
</system_trigger>`;
    const result = await chat({
      messages: [...recent, { role: "user", content: shadow }],
      system: settings.system_prompt + memories,
      selection: selection(),
      temperature: 0.9,
      maxTokens: 200,
      allowTools: false
    });
    const content = cleanPushReply(result.content);
    if (!content) return { pushed: false, reason: "empty" };
    const message = await store.addMessage(session.id, "assistant", content);
    let bark = { configured: Boolean(config.push.barkUrl), delivered: false };
    try { bark = await sendBark(content); } catch (error) { console.error("[push] bark:", error.message); }
    return { pushed: true, sessionId: session.id, messageId: message.id, bark };
  } finally {
    pushLock = false;
  }
}

export function pushStatus() {
  return {
    enabled: Boolean(config.push.secret),
    barkConfigured: Boolean(config.push.barkUrl),
    cooldownMinMinutes: config.push.cooldownMinMinutes,
    cooldownMaxMinutes: config.push.cooldownMaxMinutes,
    quietHours: false,
    dailyLimit: null
  };
}
