import test from "node:test";
import assert from "node:assert/strict";
import { attachmentLabel, claudePrompt, validateAttachments } from "../server/attachments.js";

test("validates and labels a small image attachment", () => {
  const items = validateAttachments([{ name: "photo.png", type: "image/png", data: Buffer.from("png").toString("base64") }]);
  assert.equal(items.length, 1);
  assert.match(attachmentLabel(items), /photo\.png/);
});

test("rejects unsupported attachment types", () => {
  assert.throws(() => validateAttachments([{ name: "x.exe", type: "application/octet-stream", data: "eA==" }]), /暂不支持/);
});

test("builds a Claude multimodal prompt", async () => {
  const prompt = claudePrompt("用户：看看", [{ name: "photo.png", type: "image/png", data: "eA==" }]);
  const messages = [];
  for await (const message of prompt) messages.push(message);
  assert.equal(messages[0].message.content[1].type, "image");
});
