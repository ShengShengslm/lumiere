import { randomUUID } from "node:crypto";
import { store } from "./store.js";
import { chat } from "./model.js";
import { config } from "./config.js";

let processing = false;
const iso = () => new Date().toISOString();
const delay = (min, max) => new Date(Date.now() + (min + Math.floor(Math.random() * (max - min + 1))) * 60_000).toISOString();

function selection() {
  const provider = config.providers.find((item) => item.apiKey && item.models.length);
  if (!provider) throw new Error("没有可用于朋友圈回复的模型");
  return `${provider.id}:${provider.models[0].id}`;
}

function decode(row) {
  try { return { ...JSON.parse(row.summary), row_id: row.id, session_id: row.session_id, created_at: row.created_at }; }
  catch { return null; }
}

const publicMoment = (item) => {
  if (!item) return null;
  const { context_note, ...visible } = item;
  return visible;
};

async function save(item) {
  const row = await store.updateMomentRow(item.row_id, item);
  return row ? { ...item, created_at: row.created_at || item.created_at } : item;
}

export async function createMoment(sessionId, { author = "user", content, contextNote = "", images = [] }) {
  const clean = String(content || "").trim();
  const safeImages = Array.isArray(images) ? images.slice(0, 1).filter((image) => /^data:image\/(?:jpeg|png|webp);base64,/i.test(image) && image.length < 2_500_000) : [];
  if (!clean && !safeImages.length) throw Object.assign(new Error("动态内容不能为空"), { status: 400 });
  const value = {
    id: randomUUID(),
    author,
    content: clean.slice(0, 2000),
    context_note: String(contextNote || "").slice(0, 2000),
    images: safeImages,
    image_description: "",
    reply_due_at: author === "user" ? delay(10, 20) : iso(),
    reply_status: author === "user" ? "pending" : "done",
    liked: false,
    reply_content: "",
    user_liked: false,
    comments: []
  };
  const row = await store.addMomentRow(sessionId, value);
  return publicMoment({ ...value, row_id: row.id, session_id: sessionId, created_at: row.created_at });
}

export async function createAiMoment(sessionId, content, contextNote) {
  return createMoment(sessionId, { author: "assistant", content, contextNote });
}

function parseReaction(text) {
  const cleaned = String(text || "").replace(/```(?:json)?|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  try {
    const data = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
    return {
      liked: data.like === true,
      comment: String(data.comment || "").trim().slice(0, 1000),
      imageDescription: String(data.image_description || "").trim().slice(0, 1200)
    };
  } catch {
    return { liked: true, comment: cleaned.slice(0, 1000), imageDescription: "" };
  }
}

async function contextFor(item) {
  const [settings, history, memories, rows] = await Promise.all([
    store.getSettings(),
    store.listMessages(item.session_id, true),
    store.listMemories(item.session_id),
    store.listMomentRows()
  ]);
  const recentChat = history.slice(-8).map((entry) => `${entry.role === "user" ? "用户" : "顾克"}：${entry.content.slice(0, 240)}`).join("\n");
  const recentMoments = rows.map(decode).filter(Boolean).slice(0, 3).map((entry) => `${entry.author === "user" ? "用户" : "顾克"}：${entry.content}`).join("\n");
  return { settings, recentChat, memory: memories.find((entry) => entry.metadata?.source !== "moment")?.summary?.slice(0, 1500) || "", recentMoments };
}

async function generateInitialReply(item) {
  const ctx = await contextFor(item);
  const prompt = `你正在看用户的一条朋友圈动态。请基于真实关系语气决定是否点赞和评论，不要像客服，也不要虚构现实经历。
近期聊天：
${ctx.recentChat || "无"}
长期背景：
${ctx.memory || "无"}
近期朋友圈：
${ctx.recentMoments || "无"}
当前动态：${item.content || "（只有图片）"}
${item.images.length ? "当前动态含一张图片，你会在本次请求中看到。请客观写一段图片描述供以后复用。" : ""}
只输出 JSON：{"like":true或false,"comment":"自然、简短的评论，可为空","image_description":"有图片时填写客观描述，否则为空"}`;
  const attachments = item.images.map((url, index) => {
    const match = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
    return match ? { name: `moment-${index + 1}`, type: match[1], data: match[2] } : null;
  }).filter(Boolean);
  const result = await chat({
    messages: [{ role: "user", content: prompt }],
    system: ctx.settings.system_prompt,
    selection: selection(),
    temperature: 0.8,
    maxTokens: 500,
    attachments,
    allowTools: false
  });
  return parseReaction(result.content);
}

async function generateCommentReply(item) {
  const ctx = await contextFor(item);
  const chain = item.comments.slice(-10).map((entry) => `${entry.author === "user" ? "用户" : "顾克"}：${entry.content}`).join("\n");
  const result = await chat({
    messages: [{ role: "user", content: `请回复朋友圈评论链中用户最新的一句。保持你在主聊天中的人格和关系，不要解释系统机制。\n动态：${item.content}\n隐藏语境：${item.context_note || "无"}\n图片描述：${item.image_description || "无"}\n评论链：\n${chain}\n只输出要发布的一条评论。` }],
    system: ctx.settings.system_prompt + `\n\n近期聊天：\n${ctx.recentChat}`,
    selection: selection(),
    temperature: 0.85,
    maxTokens: 300,
    allowTools: false
  });
  return String(result.content || "").trim().slice(0, 1000);
}

export async function processDueMoments() {
  if (processing) return;
  processing = true;
  try {
    const items = (await store.listMomentRows()).map(decode).filter(Boolean);
    const now = Date.now();
    for (const item of items) {
      if (item.reply_status === "pending" && new Date(item.reply_due_at).getTime() <= now) {
        const reaction = await generateInitialReply(item);
        item.liked = reaction.liked;
        item.reply_content = reaction.comment;
        item.image_description = reaction.imageDescription;
        item.reply_status = "done";
        item.replied_at = iso();
        await save(item);
      }
      const pending = item.comments.find((comment) => comment.reply_status === "pending" && new Date(comment.reply_due_at).getTime() <= now);
      if (pending) {
        const reply = await generateCommentReply(item);
        pending.reply_status = "done";
        if (reply) item.comments.push({ id: randomUUID(), author: "assistant", content: reply, reply_status: "none", created_at: iso() });
        await save(item);
      }
    }
  } finally {
    processing = false;
  }
}

export async function listMoments() {
  processDueMoments().catch((error) => console.error("[moments]", error.message));
  return (await store.listMomentRows()).map(decode).filter(Boolean).map(publicMoment);
}

async function findMoment(momentId) {
  const item = (await store.listMomentRows()).map(decode).find((entry) => entry?.id === momentId);
  if (!item) throw Object.assign(new Error("动态不存在"), { status: 404 });
  return item;
}

export async function toggleMomentLike(momentId, liked) {
  const item = await findMoment(momentId);
  item.user_liked = liked === true;
  await save(item);
  return publicMoment(item);
}

export async function addMomentComment(momentId, content) {
  const clean = String(content || "").trim();
  if (!clean) throw Object.assign(new Error("评论不能为空"), { status: 400 });
  const item = await findMoment(momentId);
  item.comments.push({ id: randomUUID(), author: "user", content: clean.slice(0, 1000), reply_due_at: delay(3, 8), reply_status: "pending", created_at: iso() });
  await save(item);
  return publicMoment(item);
}
