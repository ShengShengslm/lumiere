import { config } from "./config.js";

const endpoint = "https://api.anthropic.com/api/oauth/usage";
let cached = null;
let cachedAt = 0;

const percentage = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : null;
};

export function normalizeClaudeUsage(payload = {}) {
  const fiveHour = percentage(payload.five_hour?.utilization);
  const sevenDay = percentage(payload.seven_day?.utilization);
  return {
    available: fiveHour !== null || sevenDay !== null,
    fiveHour: { usedPercent: fiveHour, resetsAt: payload.five_hour?.resets_at || null },
    sevenDay: { usedPercent: sevenDay, resetsAt: payload.seven_day?.resets_at || null }
  };
}

export async function claudeUsage() {
  if (cached && Date.now() - cachedAt < 60_000) return cached;
  const provider = config.providers.find((item) => item.protocol === "claude-code");
  if (!provider?.apiKey) return { available: false, error: "Claude 官方订阅尚未配置" };
  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "anthropic-beta": "oauth-2025-04-20",
        "user-agent": "lumiere-personal-platform"
      },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`Claude usage API ${response.status}`);
    cached = normalizeClaudeUsage(await response.json());
    cachedAt = Date.now();
    return cached;
  } catch {
    cached = { available: false, error: "暂时无法读取 Claude 官方额度" };
    cachedAt = Date.now();
    return cached;
  }
}
