import test from "node:test";
import assert from "node:assert/strict";
import { createProviderRegistry } from "../server/config.js";
import { resolveSelection, simulatedUserStreamFilter, stripSimulatedUserReply } from "../server/model.js";

test("provider registry selects a configured model", () => {
  const providers = createProviderRegistry({ OPENAI_API_KEY: "secret", OPENAI_MODEL: "gpt-test" });
  const selected = resolveSelection("openai:gpt-test", providers);
  assert.equal(selected.provider.id, "openai");
  assert.equal(selected.model, "gpt-test");
});

test("unconfigured and unknown providers are rejected", () => {
  const providers = createProviderRegistry({});
  assert.throws(() => resolveSelection("anthropic:claude-test", providers), /尚未配置/);
  assert.throws(() => resolveSelection("unknown:model", providers), /尚未配置/);
});

test("model selection cannot inject an arbitrary model id", () => {
  const providers = createProviderRegistry({ DEEPSEEK_API_KEY: "secret", DEEPSEEK_MODEL: "allowed-model" });
  const selected = resolveSelection("deepseek:not-allowed", providers);
  assert.equal(selected.model, "allowed-model");
});

test("Claude Code subscription is a separate provider", () => {
  const providers = createProviderRegistry({ CLAUDE_CODE_OAUTH_TOKEN: "oauth-secret" });
  const selected = resolveSelection("claude-code:claude-sonnet-4-6", providers);
  assert.equal(selected.provider.protocol, "claude-code");
  assert.equal(selected.model, "claude-sonnet-4-6");
});

test("assistant output cannot continue a simulated user turn", () => {
  assert.equal(stripSimulatedUserReply("正文回答\n\n用户：替用户说的话"), "正文回答");
  assert.equal(stripSimulatedUserReply("用户：整条都是伪造回复"), "");
  assert.equal(stripSimulatedUserReply("keep this phrase: 用户：只是行内示例"), "keep this phrase: 用户：只是行内示例");
});

test("stream filter catches a simulated user turn split across chunks", async () => {
  let output = "";
  const filter = simulatedUserStreamFilter(async (chunk) => { output += chunk; }, 8);
  for (const chunk of ["第一段。\n\n用", "户", "：好耶！"]) await filter.push(chunk);
  await filter.finish();
  assert.equal(output.trim(), "第一段。");
});

test("stream filter preserves normal assistant text", async () => {
  let output = "";
  const filter = simulatedUserStreamFilter(async (chunk) => { output += chunk; }, 8);
  for (const chunk of ["正常", "回复", "内容。"]) await filter.push(chunk);
  await filter.finish();
  assert.equal(output, "正常回复内容。");
});
