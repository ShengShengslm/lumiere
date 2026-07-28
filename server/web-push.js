import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import webpush from "web-push";
import { config } from "./config.js";

const subscriptionsPath = join(process.cwd(), "data", "push-subscriptions.json");

function loadSubscriptions() {
  try {
    if (existsSync(subscriptionsPath)) {
      const value = JSON.parse(readFileSync(subscriptionsPath, "utf8"));
      return Array.isArray(value) ? value : [];
    }
  } catch (error) {
    console.warn("[web-push] subscriptions:", error.message);
  }
  return [];
}

let subscriptions = loadSubscriptions();

function saveSubscriptions() {
  mkdirSync(dirname(subscriptionsPath), { recursive: true });
  writeFileSync(subscriptionsPath, JSON.stringify(subscriptions));
}

function configured() {
  return Boolean(config.webPush.publicKey && config.webPush.privateKey && config.webPush.subject);
}

if (configured()) {
  webpush.setVapidDetails(config.webPush.subject, config.webPush.publicKey, config.webPush.privateKey);
}

export function webPushStatus() {
  return {
    configured: configured(),
    publicKey: configured() ? config.webPush.publicKey : "",
    subscriptions: subscriptions.length
  };
}

export function saveWebPushSubscription(subscription) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw Object.assign(new Error("推送订阅格式无效"), { status: 400 });
  }
  const normalized = {
    endpoint: String(subscription.endpoint),
    expirationTime: subscription.expirationTime || null,
    keys: { p256dh: String(subscription.keys.p256dh), auth: String(subscription.keys.auth) }
  };
  subscriptions = subscriptions.filter((item) => item.endpoint !== normalized.endpoint);
  subscriptions.push(normalized);
  saveSubscriptions();
  return { subscribed: true };
}

export function removeWebPushSubscription(endpoint) {
  const before = subscriptions.length;
  subscriptions = subscriptions.filter((item) => item.endpoint !== String(endpoint || ""));
  if (subscriptions.length !== before) saveSubscriptions();
  return { subscribed: false };
}

export async function sendCallWebPush({ inviteId, reason }) {
  if (!configured() || !subscriptions.length) {
    return { configured: configured(), delivered: 0, failed: 0 };
  }
  const payload = JSON.stringify({
    type: "incoming-call",
    title: "顾克来电",
    body: reason,
    tag: `lumiere-call-${inviteId}`,
    url: `/?source=push&call=${encodeURIComponent(inviteId)}`
  });
  let delivered = 0;
  let failed = 0;
  const stale = new Set();
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription, payload, { TTL: 60, urgency: "high" });
      delivered += 1;
    } catch (error) {
      failed += 1;
      if (error.statusCode === 404 || error.statusCode === 410) stale.add(subscription.endpoint);
      else console.warn("[web-push] delivery:", error.message);
    }
  }));
  if (stale.size) {
    subscriptions = subscriptions.filter((item) => !stale.has(item.endpoint));
    saveSubscriptions();
  }
  return { configured: true, delivered, failed };
}
