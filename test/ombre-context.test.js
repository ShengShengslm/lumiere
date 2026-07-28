import test from "node:test";
import assert from "node:assert/strict";

test("conversation memory strategy lets Claude defer recall but gives relay models a server-side recall", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../server/index.js", import.meta.url), "utf8"));
  assert.match(source, /ombre\.breathe\(\)/);
  assert.match(source, /provider\.protocol !== "claude-code"/);
  assert.match(source, /ombre\.recall\(query\)/);
  assert.match(source, /breathCache\.has\(sessionId\)/);
  const model = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../server/model.js", import.meta.url), "utf8"));
  assert.match(model, /mcp__ombre__breath_search/);
  assert.match(model, /任何主动保存前都必须先调用/);
  assert.match(model, /本次请求由服务端为你提供了只读的 Ombre Brain 记忆摘要/);
});
