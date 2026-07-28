import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { config, publicProviderCatalog } from "./config.js";
import { store } from "./store.js";
import { chat, chatStream, estimateTokens, summarize } from "./model.js";
import { formatModelResult, ThinkingStreamParser } from "./thinking.js";
import { ombre } from "./ombre.js";
import { listOmbreMemories, updateOmbreMemory } from "./ombre-vault.js";
import { attachmentLabel, validateAttachments } from "./attachments.js";
import { generateShadowPush, pushStatus } from "./shadow-push.js";
import { addMomentComment, createAiMoment, createMoment, listMoments, processDueMoments, toggleMomentLike } from "./moments.js";
import { claudeUsage } from "./claude-usage.js";
import { healthStore, normalizeHealthType } from "./health-store.js";
import { drivesoid, drivesContextForTurn } from "./drivesoid.js";
import { listDiary, unlockDiary, writeDiary } from "./diary.js";
import { elevenLabsStatus, synthesizeSpeech, transcribeSpeech } from "./elevenlabs.js";
import { describeAndRememberTone } from "./call-tone.js";
import { answerCallInvite, getCallInvite, maybeCreateProactiveCall, saveCallRecord } from "./call-invites.js";
import { cleanBackedUpVoiceCache } from "./voice-cache.js";

const locks = new Map();
const breathCache = new Map();
const publicRoot = process.cwd();
const json = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
};
const parseId = (value) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null; };
const readBody = async (req) => {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 22_000_000) throw Object.assign(new Error("请求过大"), { status: 413 }); }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error("JSON 格式无效"), { status: 400 }); }
};
const readBuffer = async (req, limit = 15_000_000) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("录音文件过大"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};
const cors = (req, res) => {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Health-Token");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
};
const authorized = (req) => !config.accessToken || req.headers.authorization === `Bearer ${config.accessToken}`;
const healthAuthorized = (req) => Boolean(config.health.syncToken)
  && (req.headers["x-health-token"] === config.health.syncToken
    || req.headers.authorization === `Bearer ${config.health.syncToken}`);
const publicModelError = (error) => {
  const message = String(error?.message || "");
  const sessionLimit = message.match(/session limit[\s·\-:]*resets?\s+(.+)$/i);
  if (sessionLimit) return `Claude 官方订阅本时段额度已用完，将在 ${sessionLimit[1].trim()} 后恢复。`;
  if (/rate.?limit|too many requests/i.test(message)) return "模型请求过于频繁，请稍等一会儿再试。";
  if (/上游 API|请求失败 \(502\)|bad gateway/i.test(message)) return "备用中转的上游模型暂时失败（502），请稍后重试或切换官方订阅。";
  if (/oauth|authentication|unauthorized|token/i.test(message)) return "Claude 官方订阅授权已失效，需要重新登录授权。";
  if (/max.?budget/i.test(message)) return "本次回复达到费用保护上限，请缩短消息后重试。";
  return config.production ? "模型暂时没有完成回复，请稍后再试。" : message;
};

async function compressIfNeeded(sessionId, settings) {
  const messages = await store.listMessages(sessionId, true);
  if (estimateTokens(messages) < settings.compress_threshold) return;
  const keepCount = Math.max(2, Number(settings.compress_keep_rounds) * 2);
  const old = messages.slice(0, -keepCount);
  if (!old.length) return;
  const memories = await store.listMemories(sessionId);
  const summary = await summarize(old, memories[0]?.summary || "");
  await store.addMemory(sessionId, summary, { message_ids: old.map((item) => item.id) });
  await store.hideMessages(old.map((item) => item.id));
  if (ombre.configured) await ombre.grow(summary);
}

async function initialBreath(sessionId) {
  if (!ombre.configured) return null;
  if (!breathCache.has(sessionId)) {
    const pending = ombre.breathe().catch(() => null);
    breathCache.set(sessionId, pending);
  }
  return breathCache.get(sessionId);
}

const compactMemory = (value, limit) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
};

async function memoryContext(sessionId, selection = "", query = "") {
  const [memories, surfaced] = await Promise.all([
    store.listMemories(sessionId),
    initialBreath(sessionId)
  ]);
  // Claude Code can call Ombre itself only when a specific past detail is needed.
  // OpenAI-compatible relays cannot receive MCP tools, so preserve memory quality
  // there by retrieving a compact relevant excerpt on the server.
  const providerId = String(selection).split(":")[0];
  const provider = config.providers.find((item) => item.id === providerId);
  const recalled = ombre.configured && provider && provider.protocol !== "claude-code"
    ? await ombre.recall(query)
    : null;
  const parts = [];
  if (memories[0]?.summary) parts.push(`本地长期记忆（可能不完整，以当前用户消息为准）：\n${compactMemory(memories[0].summary, 700)}`);
  if (surfaced) parts.push(`Ombre Brain 核心背景：\n${compactMemory(surfaced, 900)}`);
  if (recalled) parts.push(`与本句最相关的 Ombre 记忆（仅作背景，不要机械复述）：\n${compactMemory(recalled, 700)}`);
  return parts.length ? `\n\n${parts.join("\n\n")}` : "";
}

const healthTypeFromQuery = (query) => {
  const pairs = [
    [/(心率|heart\s*rate)/i, "heart_rate"], [/(血氧|oxygen)/i, "blood_oxygen"],
    [/(步数|走了多少步|steps?)/i, "steps"], [/(睡眠|睡了|sleep)/i, "sleep"],
    [/(体重|weight)/i, "weight"], [/(血压|blood\s*pressure)/i, "blood_pressure"]
  ];
  return pairs.find(([pattern]) => pattern.test(query))?.[1] || "";
};

const isMorningGreeting = (query) => /^\s*(早安|早上好|早呀|早啊|早哇|早(?:[！!。.，,\s~～]|$))/i.test(String(query));
const lastNightRange = (now = new Date()) => {
  const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStart = Date.UTC(shanghai.getUTCFullYear(), shanghai.getUTCMonth(), shanghai.getUTCDate()) - 8 * 60 * 60 * 1000;
  return {
    from: new Date(todayStart - 6 * 60 * 60 * 1000).toISOString(),
    to: now.toISOString()
  };
};
const numericSummary = (rows) => {
  const values = rows.map((row) => Number(row.value)).filter(Number.isFinite);
  if (!values.length) return { count: 0 };
  return {
    count: values.length,
    average: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)),
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    latest: rows.at(-1)?.value,
    unit: rows.at(-1)?.unit || ""
  };
};
const morningHealthSummary = () => {
  const range = lastNightRange();
  const sleep = healthStore.range({ type: "sleep", ...range });
  const heart = healthStore.range({ type: "heart_rate", ...range });
  const oxygen = healthStore.range({ type: "blood_oxygen", ...range });
  const steps = healthStore.range({ type: "steps", ...range });
  return {
    period: range,
    sleep: sleep.slice(-5).map((row) => ({ value: row.value, unit: row.unit, timestamp: row.timestamp, details: row.raw })),
    heart_rate: numericSummary(heart),
    blood_oxygen: numericSummary(oxygen),
    night_steps: Number(steps.reduce((sum, row) => sum + (Number(row.value) || 0), 0).toFixed(2))
  };
};

async function healthContext(selection = "", query = "") {
  if (!config.health.syncToken) return "";
  if (isMorningGreeting(query)) {
    return `\n\n【早安健康分析已触发】用户刚起床并说了早安。请主动、自然地分析昨晚健康与睡眠情况，不要只回复寒暄。先概括睡眠，再说明夜间心率、血氧及异常或数据缺失；措辞克制，不作医疗诊断。如果数据不足要明确指出。服务端统计如下：\n${JSON.stringify(morningHealthSummary()).slice(0, 12000)}`;
  }
  const providerId = String(selection).split(":")[0];
  const provider = config.providers.find((item) => item.id === providerId);
  if (provider?.protocol === "claude-code") return "";
  const type = healthTypeFromQuery(query);
  const data = healthStore.latest(type);
  const empty = Array.isArray(data) ? data.length === 0 : !data;
  if (empty && type) {
    const available = healthStore.latest();
    const availableTypes = available.map((item) => item.type);
    return `\n\n服务端健康数据状态：连接正常，数据库已有数据，但本次询问的 ${type} 类型目前没有记录。当前已有类型：${availableTypes.join("、") || "暂无"}。不要声称数据库为空或端点未连接，不要向用户索要 URL/token；准确说明该类型尚未同步。`;
  }
  return empty
    ? "\n\n服务端健康数据状态：连接正常，但数据库目前没有已同步的健康记录。不要声称端点未连接，也不要向用户索要 URL 或 token；只需说明尚无数据。"
    : `\n\n服务端健康数据（后端已直接读取，只读；时间为 ISO 8601）：\n${JSON.stringify(data).slice(0, 6000)}\n请直接依据这些数据回答，不要声称无法访问，不要向用户索要 endpoint 或 token。`;
}

const writeSse = (res, event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
const diaryTools = (sessionId, temporary = false) => temporary ? {} : ({
  onWriteDiary: (entry) => writeDiary(sessionId, entry),
  onListDiary: () => listDiary({ includeLocked: true }),
  onUnlockDiary: (id) => unlockDiary(id)
});

const voiceMessageSystem = (userText = "") => `

你具备给用户发送 ElevenLabs 语音条的能力，但不要每次都使用。只有当语气、安慰、撒娇、祝福、晚安或情绪表达确实更适合被听见时，才主动选择一条短语音；普通信息和日常回答继续只用文字。
需要发送语音时，在正常文字之间单独输出一行，严格使用：
[[voice:English or natural English mixed with a little French||准确自然的中文翻译]]
语音原文应简短、口语化，主要是英语，可自然夹杂少量法语。中文翻译必须忠实对应。不要解释这个标记，也不要把所有回复都变成语音。
${/(发|回|用).{0,5}语音|语音.{0,4}(说|回复|回我)/i.test(userText) ? "用户本轮明确要求语音：本轮必须至少输出一个完整的 [[voice:...||...]] 语音标记，不能只发普通文字。" : ""}`;

async function handleStreamingChat(sessionId, body, res) {
  res.socket?.setNoDelay?.(true);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders?.();
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
  const temporary = body.temporary === true;
  const content = String(body.content || "").trim();
  const attachments = validateAttachments(body.attachments);
  const displayContent = (content || "请查看这个附件") + attachmentLabel(attachments);
  const thinking = body.thinking === true;
  try {
    const settings = await store.getSettings();
    const userMessage = temporary ? { role: "user", content: displayContent } : await store.addMessage(sessionId, "user", displayContent);
    const [history, memoryText, healthText] = await Promise.all([store.listMessages(sessionId, true), memoryContext(sessionId, body.model, content), healthContext(body.model, content)]);
    const drivesText = await drivesContextForTurn(content, history);
    const rounds = Math.min(20, Math.max(2, Number(settings.max_context_rounds) * 2));
    const context = history.slice(-rounds).map(({ role, content: text }) => ({ role, content: text }));
    if (temporary) context.push({ role: "user", content: displayContent });
    writeSse(res, { type: "start", user: userMessage });
    const parser = new ThinkingStreamParser(thinking, (event) => writeSse(res, event));
    const result = await chatStream({
      messages: context,
      system: settings.system_prompt + memoryText + healthText + drivesText + voiceMessageSystem(content),
      selection: body.model,
      temperature: Number(settings.temperature),
      maxTokens: Number(settings.max_reply_tokens),
      attachments,
      thinking,
      onText: (chunk) => parser.push(chunk),
      onReasoning: (chunk) => parser.pushReasoning(chunk),
      onPostMoment: temporary ? null : (momentContent, contextNote) => createAiMoment(sessionId, momentContent, contextNote),
      ...diaryTools(sessionId, temporary)
    });
    const formatted = parser.finish(result);
    const assistantMessage = temporary
      ? { role: "assistant", content: formatted.content, reasoning_content: formatted.reasoning }
      : await store.addMessage(sessionId, "assistant", formatted.content, formatted.reasoning);
    void drivesoid.event("msg_assistant", { text: formatted.content });
    if (!temporary) {
      try { await compressIfNeeded(sessionId, settings); } catch (error) { console.error("memory compression:", error.message); }
    }
    writeSse(res, { type: "done", assistant: assistantMessage });
  } catch (error) {
    console.error("[stream]", error);
    writeSse(res, { type: "error", content: publicModelError(error) });
    writeSse(res, { type: "done" });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (url.pathname === "/api/health/sync" && req.method === "POST") {
    if (!healthAuthorized(req)) return json(res, 401, { error: "无效的健康同步令牌" });
    const result = healthStore.insertPayload(await readBody(req));
    if (!result.received) return json(res, 400, { error: "JSON 中没有识别到健康数据记录" });
    console.log(`[health] synced ${result.inserted}/${result.received} records at ${result.synced_at}`);
    return json(res, 201, { ok: true, ...result });
  }
  if ((url.pathname === "/api/health/latest" || url.pathname === "/api/health/range") && req.method === "GET") {
    if (!authorized(req) && !healthAuthorized(req)) return json(res, 401, { error: "需要访问令牌" });
    const type = url.searchParams.get("type") || "";
    if (url.pathname.endsWith("/latest")) return json(res, 200, { data: healthStore.latest(type) });
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!from || !to) return json(res, 400, { error: "range 查询必须提供 from 和 to" });
    return json(res, 200, { data: healthStore.range({ type, from, to }) });
  }
  if (url.pathname === "/api/push/trigger" && req.method === "POST") {
    if (!config.push.secret || req.headers["x-push-secret"] !== config.push.secret) return json(res, 401, { error: "unauthorized" });
    res.setHeader("Cache-Control", "no-store");
    return json(res, 200, await generateShadowPush({ force: url.searchParams.get("force") === "1" }));
  }
  if (url.pathname === "/api/health") return json(res, 200, { ok: true, storage: config.supabaseUrl ? "supabase" : "memory", modelConfigured: config.providers.some((item) => item.apiKey && item.models.length), ombre: await ombre.health() });
  if (!authorized(req)) return json(res, 401, { error: "需要访问令牌" });
  if (url.pathname === "/api/call/invite" && req.method === "GET") return json(res, 200, { invite: getCallInvite() });
  if (url.pathname === "/api/call/invite" && req.method === "POST") return json(res, 201, await maybeCreateProactiveCall({ force: true }));
  if (url.pathname === "/api/call/answer" && req.method === "POST") {
    const body = await readBody(req);
    const invite = await answerCallInvite({ id: String(body.id || ""), action: body.action, note: body.note });
    return invite ? json(res, 200, { ok: true, invite }) : json(res, 404, { error: "来电已结束或不存在" });
  }
  if (url.pathname === "/api/call/record" && req.method === "POST") {
    const body = await readBody(req);
    const sessions = await store.listSessions();
    const sessionId = parseId(body.session_id) || sessions[0]?.id;
    if (!sessionId) return json(res, 400, { error: "没有可保存通话记录的对话" });
    return json(res, 201, await saveCallRecord({ sessionId, seconds: body.seconds }));
  }
  if (url.pathname === "/api/voice/status" && req.method === "GET") return json(res, 200, elevenLabsStatus());
  if (url.pathname === "/api/tts" && req.method === "POST") {
    const body = await readBody(req);
    const audio = await synthesizeSpeech(body.text);
    res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": audio.length, "Cache-Control": "private, max-age=3600" });
    return res.end(audio);
  }
  if (url.pathname === "/api/stt" && req.method === "POST") {
    const result = await transcribeSpeech(await readBuffer(req), String(req.headers["content-type"] || "audio/webm").split(";")[0]);
    return json(res, 200, result);
  }
  if (url.pathname === "/api/call/reply" && req.method === "POST") {
    const body = await readBody(req);
    const content = String(body.content || "").trim();
    const rawTone = body.tone && typeof body.tone === "object" ? {
      energy: Math.max(0, Math.min(1, Number(body.tone.energy) || 0)),
      pause: Math.max(0, Math.min(1, Number(body.tone.pause) || 0)),
      duration: Math.max(0, Math.min(30, Number(body.tone.duration) || 0))
    } : null;
    const { tone, cue: toneCue } = describeAndRememberTone(rawTone);
    if (!content || content.length > 4000) return json(res, 400, { error: "通话内容为空或过长" });
    const sessions = await store.listSessions();
    const sessionId = parseId(body.session_id) || sessions[0]?.id;
    if (!sessionId) return json(res, 400, { error: "请先创建一个对话" });
    const settings = await store.getSettings();
    const [history, memoryText, healthText] = await Promise.all([
      store.listMessages(sessionId, true),
      memoryContext(sessionId, body.model, content),
      healthContext(body.model, content)
    ]);
    const toneHint = tone
      ? `\n用户这一句的本地声学线索：有效音量 ${tone.energy.toFixed(4)}，停顿比例 ${Math.round(tone.pause * 100)}%，时长 ${tone.duration.toFixed(1)} 秒。${toneCue ? `相对用户自己的近期基线：${toneCue}。` : "样本还不够建立个人基线，暂不下情绪结论。"}它只是辅助线索，不要武断判断情绪。\n`
      : "";
    const callSystem = `${settings.system_prompt}${memoryText}${healthText}${toneHint}

你正在和用户进行私人语音通话。回答必须自然、亲密、简短，适合直接说出口。
主要使用英语，偶尔自然穿插简短法语短语（例如 mon cœur、d'accord、je t'aime），不要逐句重复两种语言。
只输出严格 JSON，不要 Markdown，不要代码围栏：
{"spoken":"实际要用英语和法语说出的原句","translation":"对应的自然中文翻译","action":"continue"}
action 通常必须是 continue。只有在对话自然结束、你先温柔告别并确实希望结束通话时，才可设为 hangup；不要因为短暂停顿或一轮短回复就挂断。
translation 必须完整表达 spoken 的意思，但不要添加原句没有的内容。`;
    const context = history.slice(-10).map(({ role, content: text }) => ({ role, content: text }));
    context.push({ role: "user", content });
    const result = await chat({
      messages: context, system: callSystem, selection: body.model,
      temperature: Math.max(0.55, Number(settings.temperature)),
      maxTokens: Math.min(500, Number(settings.max_reply_tokens)),
      thinking: false, allowTools: false
    });
    let parsed;
    try { parsed = JSON.parse(String(result.content || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim()); }
    catch { parsed = { spoken: String(result.content || "").trim(), translation: "我正在陪你通话。" }; }
    const spoken = String(parsed.spoken || "").trim().slice(0, 2500);
    const translation = String(parsed.translation || "").trim().slice(0, 2500);
    if (!spoken) return json(res, 502, { error: "模型没有生成可播放的通话内容" });
    return json(res, 200, { spoken, translation, action: parsed.action === "hangup" ? "hangup" : "continue", tone, tone_cue: toneCue });
  }
  if (url.pathname === "/api/claude-usage" && req.method === "GET") return json(res, 200, await claudeUsage());
  if (url.pathname === "/api/drives/status" && req.method === "GET") return json(res, 200, await drivesoid.status());
  if (url.pathname === "/api/models" && req.method === "GET") return json(res, 200, publicProviderCatalog());
  if (url.pathname === "/api/push/status" && req.method === "GET") return json(res, 200, pushStatus());
  if (url.pathname === "/api/moments" && req.method === "GET") return json(res, 200, { entries: await listMoments() });
  if (url.pathname === "/api/diary" && req.method === "GET") return json(res, 200, { entries: await listDiary() });
  const diaryMatch = url.pathname.match(/^\/api\/diary\/(\d+)$/);
  if (diaryMatch && req.method === "GET") {
    const entry = (await listDiary()).find((item) => Number(item.id) === Number(diaryMatch[1]));
    return entry ? json(res, 200, entry) : json(res, 404, { error: "没有找到这篇日记" });
  }
  if (url.pathname === "/api/moments" && req.method === "POST") {
    const body = await readBody(req);
    const sessions = await store.listSessions();
    const sessionId = Number(body.session_id) || sessions[0]?.id;
    if (!sessionId) return json(res, 400, { error: "请先创建一个对话" });
    return json(res, 201, await createMoment(sessionId, { author: "user", content: body.content, images: body.images }));
  }
  const momentLikeMatch = url.pathname.match(/^\/api\/moments\/([^/]+)\/like$/);
  if (momentLikeMatch && req.method === "POST") {
    const body = await readBody(req);
    return json(res, 200, await toggleMomentLike(decodeURIComponent(momentLikeMatch[1]), body.liked === true));
  }
  const momentCommentMatch = url.pathname.match(/^\/api\/moments\/([^/]+)\/comments$/);
  if (momentCommentMatch && req.method === "POST") {
    const body = await readBody(req);
    return json(res, 201, await addMomentComment(decodeURIComponent(momentCommentMatch[1]), body.content));
  }
  if (url.pathname === "/api/memories" && req.method === "GET") {
    const [ombreMemories, localMemories] = await Promise.all([listOmbreMemories(), store.listAllMemories()]);
    return json(res, 200, [...ombreMemories, ...localMemories].sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }
  const memoryMatch = url.pathname.match(/^\/api\/memories\/(.+)$/);
  if (memoryMatch && req.method === "PUT") {
    const memoryId = decodeURIComponent(memoryMatch[1]);
    const body = await readBody(req);
    const summary = String(body.summary || "").trim();
    if (!summary || summary.length > 20_000) return json(res, 400, { error: "记忆内容为空或过长" });
    const row = memoryId.startsWith("ombre:")
      ? await updateOmbreMemory(memoryId, summary)
      : await store.updateMemory(parseId(memoryId), summary);
    return row ? json(res, 200, row) : json(res, 404, { error: "没有找到这条记忆" });
  }
  if (url.pathname === "/api/ombre/catalog" && req.method === "GET") {
    const status = await ombre.health();
    return json(res, 200, { ...status, catalog: status.connected ? await ombre.catalog() : null });
  }

  if (url.pathname === "/api/sessions" && req.method === "GET") return json(res, 200, await store.listSessions());
  if (url.pathname === "/api/sessions" && req.method === "POST") {
    const body = await readBody(req);
    const session = await store.createSession(String(body.name || "新的对话").slice(0, 80));
    void drivesoid.sessionStart();
    return json(res, 201, session);
  }
  let match = url.pathname.match(/^\/api\/sessions\/(\d+)$/);
  if (match) {
    const id = parseId(match[1]);
    if (req.method === "PATCH") { const body = await readBody(req); const row = await store.updateSession(id, { name: String(body.name || "新的对话").slice(0, 80) }); return row ? json(res, 200, row) : json(res, 404, { error: "会话不存在" }); }
    if (req.method === "DELETE") { breathCache.delete(id); await store.deleteSession(id); return res.writeHead(204).end(); }
  }
  match = url.pathname.match(/^\/api\/sessions\/(\d+)\/messages$/);
  if (match && req.method === "GET") return json(res, 200, await store.listMessages(parseId(match[1]), true));
  match = url.pathname.match(/^\/api\/sessions\/(\d+)\/memories$/);
  if (match && req.method === "GET") return json(res, 200, await store.listMemories(parseId(match[1])));
  match = url.pathname.match(/^\/api\/sessions\/(\d+)\/clear$/);
  if (match && req.method === "POST") { await store.clearMessages(parseId(match[1])); return json(res, 200, { ok: true }); }
  match = url.pathname.match(/^\/api\/sessions\/(\d+)\/chat$/);
  if (match && req.method === "POST") {
    const sessionId = parseId(match[1]);
    const body = await readBody(req);
    const content = String(body.content || "").trim();
    const attachments = validateAttachments(body.attachments);
    if ((!content && !attachments.length) || content.length > 20_000) return json(res, 400, { error: "消息为空或过长" });
    const displayContent = (content || "请查看这个附件") + attachmentLabel(attachments);
    if (body.stream === true) {
      if (body.temporary === true) return handleStreamingChat(sessionId, body, res);
      const previous = locks.get(sessionId) || Promise.resolve();
      const work = previous.catch(() => {}).then(() => handleStreamingChat(sessionId, body, res));
      locks.set(sessionId, work);
      try { return await work; } finally { if (locks.get(sessionId) === work) locks.delete(sessionId); }
    }
    if (body.temporary === true) {
      const settings = await store.getSettings();
      const [history, memoryText, healthText] = await Promise.all([store.listMessages(sessionId, true), memoryContext(sessionId, body.model, content), healthContext(body.model, content)]);
      const drivesText = await drivesContextForTurn(content, history);
      const context = history.slice(-Math.min(20, Math.max(2, Number(settings.max_context_rounds) * 2))).map(({ role, content: text }) => ({ role, content: text }));
      context.push({ role: "user", content: displayContent });
      const thinking = body.thinking === true;
      const result = await chat({ messages: context, system: settings.system_prompt + memoryText + healthText + drivesText + voiceMessageSystem(content), selection: body.model, temperature: Number(settings.temperature), maxTokens: Number(settings.max_reply_tokens), attachments, thinking });
      const formatted = formatModelResult(result, thinking);
      void drivesoid.event("msg_assistant", { text: formatted.content });
      return json(res, 200, { user: { role: "user", content: displayContent }, assistant: { role: "assistant", content: formatted.content, reasoning_content: formatted.reasoning } });
    }
    const previous = locks.get(sessionId) || Promise.resolve();
    const work = previous.catch(() => {}).then(async () => {
      const settings = await store.getSettings();
      const userMessage = await store.addMessage(sessionId, "user", displayContent);
      const [history, memoryText, healthText] = await Promise.all([store.listMessages(sessionId, true), memoryContext(sessionId, body.model, content), healthContext(body.model, content)]);
      const drivesText = await drivesContextForTurn(content, history);
      const rounds = Math.min(20, Math.max(2, Number(settings.max_context_rounds) * 2));
      const context = history.slice(-rounds).map(({ role, content: text }) => ({ role, content: text }));
      const thinking = body.thinking === true;
      const result = await chat({ messages: context, system: settings.system_prompt + memoryText + healthText + drivesText + voiceMessageSystem(content), selection: body.model, temperature: Number(settings.temperature), maxTokens: Number(settings.max_reply_tokens), attachments, thinking, onPostMoment: (momentContent, contextNote) => createAiMoment(sessionId, momentContent, contextNote), ...diaryTools(sessionId) });
      const formatted = formatModelResult(result, thinking);
      const assistantMessage = await store.addMessage(sessionId, "assistant", formatted.content, formatted.reasoning);
      void drivesoid.event("msg_assistant", { text: formatted.content });
      try { await compressIfNeeded(sessionId, settings); } catch (error) { console.error("memory compression:", error.message); }
      return { user: userMessage, assistant: assistantMessage };
    });
    locks.set(sessionId, work);
    try { return json(res, 200, await work); } finally { if (locks.get(sessionId) === work) locks.delete(sessionId); }
  }
  if (url.pathname === "/api/settings" && req.method === "GET") return json(res, 200, await store.getSettings());
  if (url.pathname === "/api/settings" && req.method === "PUT") {
    const body = await readBody(req);
    const allowed = ["system_prompt", "temperature", "max_context_rounds", "max_context_tokens", "compress_threshold", "compress_keep_rounds", "max_reply_tokens"];
    const values = Object.fromEntries(allowed.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
    return json(res, 200, await store.updateSettings(values));
  }
  return json(res, 404, { error: "接口不存在" });
}

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".mp3": "audio/mpeg" };
async function serveStatic(res, pathname) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const target = normalize(join(publicRoot, relative));
  if (!target.startsWith(publicRoot) || target.includes(`${join(publicRoot, "server")}`) || target.includes(`${join(publicRoot, "supabase")}`) || target.endsWith(".env")) return json(res, 404, { error: "文件不存在" });
  try { if (!(await stat(target)).isFile()) throw new Error(); const data = await readFile(target); res.writeHead(200, { "Content-Type": mime[extname(target)] || "application/octet-stream" }); res.end(data); } catch { json(res, 404, { error: "文件不存在" }); }
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  try { const url = new URL(req.url, `http://${req.headers.host || "localhost"}`); if (url.pathname.startsWith("/api/")) await handleApi(req, res, url); else await serveStatic(res, url.pathname); }
  catch (error) { console.error(error); if (!res.headersSent) json(res, error.status || 500, { error: config.production ? "服务器处理失败" : error.message }); }
});
server.listen(config.port, config.host, () => console.log(`Lumière running at http://${config.host}:${config.port}`));
setInterval(() => processDueMoments().catch((error) => console.error("[moments]", error.message)), 60_000).unref();
setInterval(() => maybeCreateProactiveCall().catch((error) => console.error("[call]", error.message)), 10 * 60_000).unref();
setTimeout(() => maybeCreateProactiveCall().catch((error) => console.error("[call]", error.message)), 90_000).unref();
setInterval(() => cleanBackedUpVoiceCache().catch((error) => console.error("[voice-cache]", error.message)), 24 * 60 * 60_000).unref();
setTimeout(() => cleanBackedUpVoiceCache().catch((error) => console.error("[voice-cache]", error.message)), 2 * 60_000).unref();
