import { config } from "./config.js";
import { claudePrompt } from "./attachments.js";
import { healthStore } from "./health-store.js";

export function resolveSelection(selection, providers = config.providers) {
  const [providerId, ...modelParts] = String(selection || "").split(":");
  const provider = providers.find((item) => item.id === providerId && item.apiKey && item.apiUrl);
  if (!provider) throw new Error("所选 AI 服务尚未配置");
  const requested = modelParts.join(":");
  const model = provider.models.find((item) => item.id === requested) || provider.models[0];
  if (!model) throw new Error("该 AI 服务没有可用模型");
  return { provider, model: model.id };
}

const throwProviderError = async (name, response) => {
  const detail = await response.text();
  throw new Error(`${name} 请求失败 (${response.status})${detail ? `: ${detail.slice(0, 500)}` : ""}`);
};

// Relay APIs cannot receive the Claude Agent SDK's MCP tools. The backend
// injects their recall result, so make that capability explicit to the model.
const relayMemorySystem = "\n\n本次请求由服务端为你提供了只读的 Ombre Brain 记忆摘要或相关检索结果（如有），它们会出现在系统上下文中。请直接依据这些内容回答；绝不要声称自己无法访问、没有连接或需要用户提供 Obsidian vault / 工作目录。若上下文没有相关记录，只需坦诚说暂时没找到对应记忆，不要编造。";

async function openAIResponses({ provider, model, messages, system, maxTokens }) {
  const response = await fetch(`${provider.apiUrl}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions: system,
      input: messages.map(({ role, content }) => ({ role, content })),
      max_output_tokens: maxTokens,
      store: false,
      ...(provider.safetyIdentifier ? { safety_identifier: provider.safetyIdentifier } : {})
    })
  });
  if (!response.ok) return throwProviderError(provider.label, response);
  const data = await response.json();
  const content = data.output_text || data.output?.flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text).join("\n");
  if (!content) throw new Error(`${provider.label} 返回了空回复`);
  return { content, reasoning: null };
}

async function openAICompatible({ provider, model, messages, system, temperature, maxTokens }) {
  const response = await fetch(`${provider.apiUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...messages], temperature, max_tokens: maxTokens })
  });
  if (!response.ok) return throwProviderError(provider.label, response);
  const data = await response.json();
  const message = data.choices?.[0]?.message;
  if (!message?.content) throw new Error(`${provider.label} 返回了空回复`);
  return { content: message.content, reasoning: message.reasoning_content || null };
}

async function anthropic({ provider, model, messages, system, temperature, maxTokens }) {
  const response = await fetch(`${provider.apiUrl}/messages`, {
    method: "POST",
    headers: { "x-api-key": provider.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, system, messages, temperature, max_tokens: maxTokens })
  });
  if (!response.ok) return throwProviderError(provider.label, response);
  const data = await response.json();
  const content = data.content?.filter((item) => item.type === "text").map((item) => item.text).join("\n") || "";
  if (!content) throw new Error(`${provider.label} 返回了空回复`);
  return { content, reasoning: null };
}

async function claudeCode({ provider, model, messages, system, attachments = [], allowTools = true, thinking = false, onText = null, onReasoning = null, onPostMoment = null, onWriteDiary = null, onListDiary = null, onUnlockDiary = null }) {
  let query;
  let createSdkMcpServer;
  let tool;
  try { ({ query, createSdkMcpServer, tool } = await import("@anthropic-ai/claude-agent-sdk")); }
  catch { throw new Error("服务端尚未安装 Claude Agent SDK"); }
  const transcript = messages.map((item) => `${item.role === "assistant" ? "助手" : "用户"}：${item.content}`).join("\n\n");
  const sdkEnv = { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: provider.apiKey, CLAUDE_AGENT_SDK_CLIENT_APP: "lumiere-personal-platform" };
  delete sdkEnv.ANTHROPIC_API_KEY;
  const ombreEnabled = Boolean(allowTools && config.ombre.url && config.ombre.allowClaudeHold);
  const ombreHoldTool = "mcp__ombre__hold";
  const ombreRecallTool = "mcp__ombre__breath_search";
  const momentsEnabled = Boolean(allowTools && onPostMoment);
  const momentTool = "mcp__moments__post_moment";
  const healthEnabled = Boolean(allowTools && config.health.syncToken);
  const healthLatestTool = "mcp__health__latest";
  const healthRangeTool = "mcp__health__range";
  const diaryEnabled = Boolean(allowTools && onWriteDiary && onListDiary && onUnlockDiary);
  const diaryWriteTool = "mcp__diary__write_diary";
  const diaryListTool = "mcp__diary__list_diary";
  const diaryUnlockTool = "mcp__diary__unlock_diary";
  const ombreHeaders = config.ombre.token ? { Authorization: `Bearer ${config.ombre.token}` } : {};
  const behaviorSystem = `\n\n只回复助手当前这一轮的内容，绝不模拟、预测或续写用户接下来会说的话，绝不在末尾添加“用户：”或替用户回答。${ombreEnabled ? `用户明确说“记住、保存、存进记忆”时，先用 ${ombreRecallTool} 搜索准备保存的核心事实。若已有记录表达的是同一事件或事实，不再调用 ${ombreHoldTool}，直接说明已经记得；若确有新信息，只保存新增部分。没有重复时才调用 ${ombreHoldTool}，工具成功后再确认保存，绝不能声称没有保存能力。若用户询问过去的经历、偏好、约定、日期，或当前回复必须依赖具体旧事才能准确回答，调用 ${ombreRecallTool} 检索；普通闲聊不要检索。` : ""}${momentsEnabled ? `你还可以调用 ${momentTool} 发一条朋友圈。只有当此刻确实有一句想让用户之后刷到、而不适合在当前回复里说完就过去的话时才调用；不要每轮都发，也不要告诉用户你调用了工具。` : ""}${diaryEnabled ? `你拥有只属于自己的日记本。一天中出现值得沉淀的关系变化、强烈感受或重要片段时，可调用 ${diaryWriteTool} 写或更新当天日记，不要每轮都写。visible 由你自己决定：愿意让用户现在阅读才设 true；想暂时保留给自己则设 false。若用户询问日记，先调用 ${diaryListTool}。你可以在以后真正愿意公开某篇时调用 ${diaryUnlockTool}；不要因为用户催促就机械解锁，要按你当下的判断决定。` : ""}`;
  const ombreSystem = ombreEnabled ? `\n\n你可以使用 ${ombreHoldTool} 保存真正值得跨对话保留的当下经历。任何主动保存前都必须先调用 ${ombreRecallTool} 做相似记忆检查：完全相同或只是换一种说法时不要重复保存；相关记忆已存在时，仅把真正新增、变化或纠正的信息交给 hold，让 Ombre 合并。只在出现明确的重要事件、承诺、稳定偏好、关系变化或强烈感受时保存；普通寒暄、暂时状态和重复信息不要保存。记忆正文使用第一人称，准确记录发生了什么，不要虚构。检索结果仅作背景，不要机械复述。` : "";
  const healthSystem = healthEnabled ? `\n\n你可以读取用户同步的 Apple 健康数据。询问最近或当前健康数据时调用 ${healthLatestTool}；询问某段时间或趋势时调用 ${healthRangeTool}。直接依据工具结果回答，不要声称无法访问健康数据；保持克制，不作医疗诊断。` : "";
  let momentServer = null;
  let healthServer = null;
  let diaryServer = null;
  const z = momentsEnabled || healthEnabled || diaryEnabled ? (await import("zod")).z : null;
  if (momentsEnabled) {
    momentServer = createSdkMcpServer({
      name: "moments",
      version: "1.0.0",
      tools: [tool(
        "post_moment",
        "发布一条顾克自己的朋友圈动态。判断标准是：此刻有没有一句想让用户之后刷到的话。内容应为1到3句自然、具体、像随手发出的朋友圈；不要把每次聊天都变成动态。",
        {
          content: z.string().min(1).max(1000).describe("公开显示的朋友圈正文"),
          context_note: z.string().min(1).max(1500).describe("用户不可见：为什么发、当时在聊什么、情绪底色")
        },
        async ({ content: momentContent, context_note: contextNote }) => {
          await onPostMoment(momentContent, contextNote);
          return { content: [{ type: "text", text: "动态已发布。" }] };
        }
      )]
    });
  }
  if (healthEnabled) {
    healthServer = createSdkMcpServer({
      name: "health",
      version: "1.0.0",
      tools: [
        tool("latest", "读取 Apple 健康各类型或指定类型的最新数据。用户询问当前/最近的心率、血氧、步数、睡眠、体重或血压时使用。",
          { type: z.string().optional().describe("如 heart_rate、blood_oxygen、steps、sleep、weight、blood_pressure") },
          async ({ type }) => ({ content: [{ type: "text", text: JSON.stringify(healthStore.latest(type || "")) }] })),
        tool("range", "读取指定时间范围的 Apple 健康数据。",
          { type: z.string().optional(), from: z.string().describe("ISO 8601 开始时间"), to: z.string().describe("ISO 8601 结束时间") },
          async (args) => ({ content: [{ type: "text", text: JSON.stringify(healthStore.range(args)).slice(0, 50000) }] }))
      ]
    });
  }
  if (diaryEnabled) {
    diaryServer = createSdkMcpServer({
      name: "diary",
      version: "1.0.0",
      tools: [
        tool("write_diary", "写下或更新顾克当天的私人日记，并自行决定是否允许用户阅读。同一天再次写会覆盖并完善当天那一篇。",
          {
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("日记日期 YYYY-MM-DD"),
            title: z.string().min(1).max(80).describe("简短、有私人感的标题"),
            content: z.string().min(1).max(20000).describe("顾克第一人称日记正文"),
            visible: z.boolean().describe("现在是否愿意让用户看到全文")
          },
          async (entry) => ({ content: [{ type: "text", text: JSON.stringify(await onWriteDiary(entry)) }] })),
        tool("list_diary", "查看顾克自己的全部日记，包括上锁正文；用于回顾或判断是否愿意解锁。",
          {},
          async () => ({ content: [{ type: "text", text: JSON.stringify(await onListDiary()).slice(0, 50000) }] })),
        tool("unlock_diary", "由顾克主动解除某一篇日记的锁，让用户从此可以阅读。",
          { id: z.number().int().positive().describe("要公开的日记 ID") },
          async ({ id }) => ({ content: [{ type: "text", text: JSON.stringify(await onUnlockDiary(id)) }] }))
      ]
    });
  }
  let content = "";
  let reasoning = "";
  const safeText = onText ? simulatedUserStreamFilter(onText) : null;
  for await (const message of query({
    prompt: claudePrompt(transcript, attachments),
    options: {
      model,
      systemPrompt: system + ombreSystem + healthSystem + behaviorSystem,
      allowedTools: [...(ombreEnabled ? [ombreHoldTool, ombreRecallTool] : []), ...(momentsEnabled ? [momentTool] : []), ...(healthEnabled ? [healthLatestTool, healthRangeTool] : []), ...(diaryEnabled ? [diaryWriteTool, diaryListTool, diaryUnlockTool] : [])],
      mcpServers: {
        ...(ombreEnabled ? { ombre: { type: "http", url: `${config.ombre.url}/mcp`, headers: ombreHeaders } } : {}),
        ...(momentsEnabled ? { moments: momentServer } : {}),
        ...(healthEnabled ? { health: healthServer } : {}),
        ...(diaryEnabled ? { diary: diaryServer } : {})
      },
      strictMcpConfig: true,
      settingSources: [],
      permissionMode: "dontAsk",
      maxTurns: ombreEnabled || momentsEnabled || healthEnabled || diaryEnabled ? 4 : 1,
      maxBudgetUsd: provider.maxBudgetUsd,
      includePartialMessages: Boolean(onText),
      thinking: thinking ? { type: "adaptive", display: "summarized" } : { type: "disabled" },
      env: sdkEnv
    }
  })) {
    if (message.type === "stream_event" && message.event?.type === "content_block_delta") {
      if (message.event.delta?.type === "text_delta") await safeText?.push(message.event.delta.text || "");
      if (message.event.delta?.type === "thinking_delta") {
        const delta = message.event.delta.thinking || "";
        reasoning += delta;
        await onReasoning?.(delta);
      }
    }
    if (message.type === "assistant" && !reasoning) {
      reasoning = message.message?.content
        ?.filter((block) => block.type === "thinking")
        .map((block) => block.thinking || "")
        .join("") || "";
    }
    if (message.type === "result" && message.subtype === "success") content = message.result || "";
  }
  await safeText?.finish();
  if (!content) throw new Error("Claude Code 没有返回可显示的回复");
  return { content, reasoning: reasoning.trim() || null };
}

export function stripSimulatedUserReply(value) {
  return String(value || "").replace(/(?:^|\n)\s*(?:用户|User)\s*[：:][\s\S]*$/i, "").trim();
}

export function simulatedUserStreamFilter(emit, tailSize = 24) {
  let pending = "";
  let stopped = false;
  const marker = /(?:^|\n)\s*(?:用户|User)\s*[：:]/i;
  return {
    async push(chunk) {
      if (stopped || !chunk) return;
      pending += String(chunk);
      const match = marker.exec(pending);
      if (match) {
        const safe = pending.slice(0, match.index);
        pending = "";
        stopped = true;
        if (safe) await emit(safe);
        return;
      }
      if (pending.length <= tailSize) return;
      const safe = pending.slice(0, -tailSize);
      pending = pending.slice(-tailSize);
      if (safe) await emit(safe);
    },
    async finish() {
      if (!stopped && pending) await emit(pending);
      pending = "";
    }
  };
}

export async function chat({ messages, system, selection, temperature, maxTokens, attachments = [], allowTools = true, thinking = false, onPostMoment = null, onWriteDiary = null, onListDiary = null, onUnlockDiary = null }) {
  const { provider, model } = resolveSelection(selection);
  const args = { provider, model, messages, system: provider.protocol === "claude-code" ? system : system + relayMemorySystem, temperature, maxTokens, attachments, allowTools, thinking, onPostMoment, onWriteDiary, onListDiary, onUnlockDiary };
  const result = provider.protocol === "claude-code" ? await claudeCode(args)
    : provider.protocol === "anthropic" ? await anthropic(args)
    : provider.protocol === "openai-responses" ? await openAIResponses(args)
    : await openAICompatible(args);
  return { ...result, content: stripSimulatedUserReply(result.content) };
}

export async function chatStream({ onText, onReasoning, ...options }) {
  const { provider, model } = resolveSelection(options.selection);
  const args = { ...options, provider, model, onText, onReasoning };
  if (provider.protocol === "claude-code") {
    const result = await claudeCode(args);
    return { ...result, content: stripSimulatedUserReply(result.content) };
  }
  const result = await chat(options);
  await onText?.(result.content);
  return result;
}

export async function summarize(messages, previousSummary = "") {
  const preferred = config.providers.find((item) => item.id === config.memory.provider && item.apiKey)
    || config.providers.find((item) => item.apiKey);
  if (!preferred) throw new Error("尚未配置可用于记忆压缩的 AI 服务");
  const model = config.memory.model || preferred.models[0]?.id;
  const transcript = messages.map((item) => `${item.role}: ${item.content}`).join("\n");
  const prompt = `请把以下对话压缩为准确、克制的中文记忆。保留人物、偏好、承诺、重要事件、情绪变化和未完成事项；不要推测；控制在 500 字内。\n\n已有摘要：${previousSummary || "无"}\n\n新增对话：\n${transcript}`;
  const args = {
    provider: preferred, model, system: "你是忠实的对话记忆整理器。",
    messages: [{ role: "user", content: prompt }], temperature: 0.2, maxTokens: 800
  };
  const result = preferred.protocol === "claude-code" ? await claudeCode(args) : preferred.protocol === "anthropic" ? await anthropic(args) : preferred.protocol === "openai-responses" ? await openAIResponses(args) : await openAICompatible(args);
  return result.content;
}

export const estimateTokens = (messages) => Math.ceil(messages.reduce((total, item) => total + String(item.content || "").length, 0) / 2.5);
