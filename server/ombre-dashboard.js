import { config } from "./config.js";

let sessionCookie = "";
let loginPromise = null;

const baseUrl = () => config.ombre.dashboardUrl || config.ombre.url;
export const ombreDashboardConfigured = () => Boolean(baseUrl());

function captureCookie(response) {
  const value = response.headers.get("set-cookie");
  if (value) sessionCookie = value.split(";")[0];
}

async function login() {
  if (!config.ombre.dashboardPassword) return "";
  const response = await fetch(`${baseUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: config.ombre.dashboardPassword }),
    signal: AbortSignal.timeout(config.ombre.dashboardTimeoutMs)
  });
  captureCookie(response);
  if (!response.ok || !sessionCookie) throw Object.assign(new Error("Ombre Dashboard login failed"), { code: "OMBRE_AUTH_FAILED" });
  return sessionCookie;
}

async function ensureLogin() {
  if (!config.ombre.dashboardPassword || sessionCookie) return sessionCookie;
  if (!loginPromise) loginPromise = login().finally(() => { loginPromise = null; });
  return loginPromise;
}

export async function ombreDashboardRequest(path, options = {}, retried = false) {
  if (!ombreDashboardConfigured()) throw Object.assign(new Error("Ombre Dashboard is not configured"), { code: "OMBRE_NOT_CONFIGURED" });
  await ensureLogin();
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    ...(!sessionCookie && config.ombre.token ? { Authorization: `Bearer ${config.ombre.token}` } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`${baseUrl()}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(config.ombre.dashboardTimeoutMs)
  });
  captureCookie(response);
  if (response.status === 401 && !retried && config.ombre.dashboardPassword) {
    sessionCookie = "";
    await ensureLogin();
    return ombreDashboardRequest(path, options, true);
  }
  if (!response.ok) throw Object.assign(new Error(`Ombre Dashboard ${response.status}`), { code: response.status === 401 ? "OMBRE_AUTH_FAILED" : "OMBRE_UPSTREAM_ERROR", status: response.status });
  return response.json();
}

const arrayValue = (value) => Array.isArray(value)
  ? value.map(String).filter(Boolean)
  : typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
const numberValue = (...values) => {
  const match = values.find((value) => value !== undefined && value !== null && value !== "");
  const parsed = Number(match);
  return Number.isFinite(parsed) ? parsed : null;
};
const booleanValue = (value) => typeof value === "string"
  ? ["true", "1", "yes"].includes(value.toLowerCase())
  : Boolean(value);

export function normalizeOmbreBucket(bucket = {}) {
  const meta = bucket.meta || bucket.metadata || {};
  const content = String(bucket.content || bucket.text || bucket.body || bucket.summary || "");
  const preview = String(bucket.content_preview || bucket.contentPreview || bucket.preview || content);
  return {
    id: String(bucket.id || bucket.bucket_id || bucket.name || ""),
    name: String(bucket.name || bucket.title || meta.name || bucket.id || "未命名记忆"),
    content,
    contentPreview: preview.replace(/\s+/g, " ").trim().slice(0, 180),
    type: String(bucket.type || meta.type || "dynamic").toLowerCase(),
    domains: arrayValue(bucket.domains || bucket.domain || meta.domains || meta.domain),
    tags: arrayValue(bucket.tags || meta.tags),
    importance: Math.max(0, Math.min(10, numberValue(bucket.importance, meta.importance) ?? 5)),
    valence: numberValue(bucket.valence, meta.valence),
    arousal: numberValue(bucket.arousal, meta.arousal),
    pinned: booleanValue(bucket.pinned ?? meta.pinned),
    resolved: booleanValue(bucket.resolved ?? meta.resolved),
    digested: booleanValue(bucket.digested ?? meta.digested),
    activationCount: numberValue(bucket.activation_count, bucket.activationCount, meta.activation_count) ?? 0,
    createdAt: bucket.created_at || bucket.createdAt || bucket.created || meta.created || null,
    lastActiveAt: bucket.last_active_at || bucket.lastActiveAt || bucket.last_active || meta.last_active || bucket.created_at || null
  };
}

export const dashboardItems = (data) => (Array.isArray(data) ? data : data?.buckets || data?.items || data?.results || [])
  .map(normalizeOmbreBucket)
  .filter((item) => item.id);
