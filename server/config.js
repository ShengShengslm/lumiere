const number = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const cleanUrl = (value, fallback = "") => String(value || fallback).replace(/\/$/, "");
const uniqueModels = (models) => [...new Map(models.map((model) => [model.id, model])).values()];

export function createProviderRegistry(env = process.env) {
  return [
    {
      id: "claude-code", label: "Claude 官方订阅", protocol: "claude-code",
      apiUrl: "local-agent-sdk", apiKey: env.CLAUDE_CODE_OAUTH_TOKEN || "",
      maxBudgetUsd: number(env.CLAUDE_CODE_MAX_BUDGET_USD, 0.25),
      models: uniqueModels([
        { id: env.CLAUDE_CODE_MODEL || "claude-sonnet-4-6", label: `自定义默认 · ${env.CLAUDE_CODE_MODEL || "Sonnet 4.6"}` },
        { id: "sonnet", label: "Sonnet · 自动最新版" },
        { id: "opus", label: "Opus · 自动最新版" },
        { id: "haiku", label: "Haiku · 自动最新版" },
        { id: "claude-sonnet-5", label: "Sonnet 5" },
        { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
        { id: "claude-sonnet-4-5", label: "Sonnet 4.5" },
        { id: "claude-opus-4-8", label: "Opus 4.8" },
        { id: "claude-opus-4-7", label: "Opus 4.7" },
        { id: "claude-opus-4-6", label: "Opus 4.6" },
        { id: "claude-opus-4-5", label: "Opus 4.5" },
        { id: "claude-haiku-4-5", label: "Haiku 4.5" }
      ])
    },
    {
      id: "openai", label: "OpenAI", protocol: "openai-responses",
      apiUrl: cleanUrl(env.OPENAI_API_URL, "https://api.openai.com/v1"), apiKey: env.OPENAI_API_KEY || "",
      safetyIdentifier: env.OPENAI_SAFETY_IDENTIFIER || "",
      models: [
        { id: env.OPENAI_MODEL || "gpt-5.6-terra", label: "GPT-5.6 Terra" },
        { id: env.OPENAI_FAST_MODEL || "gpt-5.6-luna", label: "GPT-5.6 Luna" },
        { id: env.OPENAI_PRO_MODEL || "gpt-5.6-sol", label: "GPT-5.6 Sol" }
      ]
    },
    {
      id: "anthropic", label: "Claude API", protocol: "anthropic",
      apiUrl: cleanUrl(env.ANTHROPIC_API_URL, "https://api.anthropic.com/v1"), apiKey: env.ANTHROPIC_API_KEY || "",
      models: uniqueModels([
        { id: env.ANTHROPIC_MODEL || "claude-sonnet-4-6", label: `默认 · ${env.ANTHROPIC_MODEL || "Sonnet 4.6"}` },
        { id: env.ANTHROPIC_FAST_MODEL || "claude-haiku-4-5", label: `快速 · ${env.ANTHROPIC_FAST_MODEL || "Haiku 4.5"}` },
        { id: env.ANTHROPIC_PRO_MODEL || "claude-opus-4-8", label: `高性能 · ${env.ANTHROPIC_PRO_MODEL || "Opus 4.8"}` },
        { id: "claude-sonnet-5", label: "Sonnet 5" },
        { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
        { id: "claude-sonnet-4-5", label: "Sonnet 4.5" },
        { id: "claude-opus-4-8", label: "Opus 4.8" },
        { id: "claude-opus-4-7", label: "Opus 4.7" },
        { id: "claude-opus-4-6", label: "Opus 4.6" },
        { id: "claude-opus-4-5", label: "Opus 4.5" },
        { id: "claude-haiku-4-5", label: "Haiku 4.5" }
      ])
    },
    {
      id: "deepseek", label: "DeepSeek", protocol: "openai-compatible",
      apiUrl: cleanUrl(env.DEEPSEEK_API_URL, "https://api.deepseek.com"), apiKey: env.DEEPSEEK_API_KEY || "",
      models: [
        { id: env.DEEPSEEK_MODEL || "deepseek-chat", label: "DeepSeek Chat" },
        { id: env.DEEPSEEK_REASONER_MODEL || "deepseek-reasoner", label: "DeepSeek Reasoner" }
      ]
    },
    {
      id: "custom", label: env.CUSTOM_PROVIDER_LABEL || "兼容中转", protocol: "openai-compatible",
      apiUrl: cleanUrl(env.CUSTOM_API_URL), apiKey: env.CUSTOM_API_KEY || "",
      models: String(env.CUSTOM_MODELS || "").split(",").map((id) => id.trim()).filter(Boolean).map((id) => ({ id, label: id }))
    }
  ];
}

const providers = createProviderRegistry();
export const config = {
  port: number(process.env.PORT, 3000),
  production: process.env.NODE_ENV === "production",
  host: process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",").map((value) => value.trim()).filter(Boolean),
  accessToken: process.env.APP_ACCESS_TOKEN || "",
  supabaseUrl: cleanUrl(process.env.SUPABASE_URL),
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  health: {
    syncToken: process.env.HEALTH_SYNC_TOKEN || "",
    dbPath: process.env.HEALTH_DB_PATH || `${process.cwd()}/data/health.sqlite`,
    retentionDays: Math.max(1, number(process.env.HEALTH_RETENTION_DAYS, 3))
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || "",
    voiceId: process.env.ELEVENLABS_VOICE_ID || "",
    modelId: process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5",
    outputFormat: process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128",
    cachePath: process.env.ELEVENLABS_CACHE_PATH || `${process.cwd()}/data/voice-cache`,
    cacheRetentionDays: Math.max(1, number(process.env.ELEVENLABS_CACHE_RETENTION_DAYS, 14))
  },
  providers,
  memory: {
    provider: process.env.MEMORY_PROVIDER || (providers.find((item) => item.id === "deepseek" && item.apiKey) ? "deepseek" : ""),
    model: process.env.MEMORY_MODEL || ""
  },
  ombre: {
    url: cleanUrl(process.env.OMBRE_BRAIN_URL),
    vaultPath: process.env.OMBRE_BRAIN_VAULT_PATH || "",
    token: process.env.OMBRE_BRAIN_TOKEN || "",
    timeoutMs: number(process.env.OMBRE_BRAIN_TIMEOUT_MS, 3000),
    maxResults: number(process.env.OMBRE_BRAIN_MAX_RESULTS, 5),
    catalogMaxTokens: number(process.env.OMBRE_BRAIN_CATALOG_MAX_TOKENS, 3000),
    allowClaudeHold: String(process.env.OMBRE_ALLOW_CLAUDE_HOLD || "true").toLowerCase() === "true"
  },
  push: {
    secret: process.env.PUSH_SECRET || "",
    modelSelection: process.env.PUSH_MODEL_SELECTION || "",
    cooldownMinMinutes: number(process.env.PUSH_COOLDOWN_MIN_MINUTES, 30),
    cooldownMaxMinutes: number(process.env.PUSH_COOLDOWN_MAX_MINUTES, 120),
    barkUrl: cleanUrl(process.env.BARK_URL),
    publicAppUrl: process.env.PUBLIC_APP_URL || "https://43-156-145-27.sslip.io",
    title: process.env.PUSH_TITLE || "顾克",
    iconUrl: process.env.BARK_ICON_URL || `${process.env.PUBLIC_APP_URL || "https://43-156-145-27.sslip.io"}/app-icon-512.png`
  },
  webPush: {
    subject: process.env.WEB_PUSH_SUBJECT || "",
    publicKey: process.env.WEB_PUSH_PUBLIC_KEY || "",
    privateKey: process.env.WEB_PUSH_PRIVATE_KEY || ""
  }
};

export const publicProviderCatalog = () => config.providers.map(({ id, label, protocol, models, apiKey, apiUrl }) => ({
  id, label, protocol, models, configured: Boolean(apiKey && apiUrl && models.length)
}));

if (config.production && !config.accessToken) console.warn("[security] APP_ACCESS_TOKEN is not set; the API is publicly accessible.");
