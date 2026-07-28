import test from "node:test";
import assert from "node:assert/strict";
import { formatModelResult, ThinkingStreamParser } from "../server/thinking.js";

test("thinking mode uses only a provider-supplied summary", () => {
  const result = formatModelResult({ content: "这是正文。", reasoning: "关注用户的核心问题。" }, true);
  assert.deepEqual(result, { reasoning: "关注用户的核心问题。", content: "这是正文。" });
});

test("thinking mode never exposes provider hidden reasoning", () => {
  const result = formatModelResult({ content: "普通回答", reasoning: "内部推理" }, false);
  assert.deepEqual(result, { content: "普通回答", reasoning: null });
});

test("thinking mode stays empty when the provider does not return a summary", () => {
  const result = formatModelResult({ content: "正常正文", reasoning: null }, true);
  assert.deepEqual(result, { reasoning: null, content: "正常正文" });
});

test("thinking mode strips protocol tags even when formatting is malformed", () => {
  const result = formatModelResult({ content: "<reasoning_summary>摘要</reasoning_summary>\n正文" }, true);
  assert.equal(result.reasoning, null);
  assert.doesNotMatch(result.content, /reasoning_summary|answer/i);
});

test("stream parser separates provider summary events from answer text", () => {
  const events = [];
  const parser = new ThinkingStreamParser(true, (event) => events.push(event));
  parser.pushReasoning("先看情绪");
  parser.pushReasoning("和上下文。");
  parser.push("慢慢");
  parser.push("回答你。");
  const result = parser.finish({ content: "慢慢回答你。", reasoning: "先看情绪和上下文。" });
  assert.deepEqual(result, { reasoning: "先看情绪和上下文。", content: "慢慢回答你。" });
  assert.equal(events.filter((event) => event.type === "reasoning").map((event) => event.content).join(""), "先看情绪和上下文。");
  assert.equal(events.filter((event) => event.type === "text").map((event) => event.content).join(""), "慢慢回答你。");
  assert.doesNotMatch(JSON.stringify(events), /reasoning_summary|<answer>/);
});

test("stream parser does not invent a summary when the provider omits one", () => {
  const events = [];
  const parser = new ThinkingStreamParser(true, (event) => events.push(event));
  parser.push("直接正文");
  parser.finish({ content: "直接正文" });
  assert.equal(events.some((event) => event.type === "reasoning"), false);
  assert.equal(events.filter((event) => event.type === "text").map((event) => event.content).join(""), "直接正文");
});
