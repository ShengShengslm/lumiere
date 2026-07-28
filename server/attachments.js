const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const SUPPORTED = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf", "text/plain", "text/markdown", "text/csv", "application/json"
]);

export function validateAttachments(input) {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > 3) throw Object.assign(new Error("一次最多发送 3 个附件"), { status: 400 });
  return input.map((item) => {
    const name = String(item?.name || "附件").slice(0, 160);
    const type = String(item?.type || "application/octet-stream").toLowerCase();
    const data = String(item?.data || "").replace(/^data:[^;]+;base64,/, "");
    if (!SUPPORTED.has(type)) throw Object.assign(new Error(`暂不支持这种文件：${name}`), { status: 400 });
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw Object.assign(new Error(`附件内容无效：${name}`), { status: 400 });
    const bytes = Math.floor(data.length * 3 / 4);
    if (!bytes || bytes > MAX_ATTACHMENT_BYTES) throw Object.assign(new Error(`附件需小于 5MB：${name}`), { status: 413 });
    return { name, type, data };
  });
}

export const attachmentLabel = (items) => items.length ? `\n\n${items.map((item) => `[附件：${item.name}]`).join("\n")}` : "";

export function claudePrompt(transcript, attachments) {
  if (!attachments.length) return transcript;
  const content = [{ type: "text", text: transcript }];
  for (const item of attachments) {
    if (item.type.startsWith("image/")) content.push({ type: "image", source: { type: "base64", media_type: item.type, data: item.data } });
    else if (item.type === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: item.type, data: item.data }, title: item.name });
    else content.push({ type: "text", text: `\n\n--- ${item.name} ---\n${Buffer.from(item.data, "base64").toString("utf8")}` });
  }
  return (async function* () {
    yield { type: "user", message: { role: "user", content }, parent_tool_use_id: null, origin: { kind: "human" } };
  })();
}
