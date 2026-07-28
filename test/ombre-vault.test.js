import test from "node:test";
import assert from "node:assert/strict";
import { parseOmbreMarkdown } from "../server/ombre-vault.js";

test("parses a sanitized Ombre memory for the timeline", () => {
  const memory = parseOmbreMarkdown(`---
id: abc123
name: 一次重要谈话
created: 2026-06-27T20:30:00+08:00
type: dynamic
importance: 8
valence: 0.8
arousal: 0.6
---
我记得这次谈话。`, "fallback");
  assert.equal(memory.id, "ombre:abc123");
  assert.equal(memory.metadata.source, "ombre");
  assert.equal(memory.metadata.name, "一次重要谈话");
  assert.equal(memory.summary, "我记得这次谈话。");
  assert.match(memory.created_at, /^2026-06-27T12:30:00/);
});

test("rejects malformed Ombre files", () => assert.equal(parseOmbreMarkdown("plain text"), null));
