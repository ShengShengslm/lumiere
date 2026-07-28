import test from "node:test";
import assert from "node:assert/strict";
import { cleanPushReply, cooldownDecision } from "../server/shadow-push.js";

test("shadow push cleanup removes formatting and softly limits text", () => {
  assert.equal(cleanPushReply("**想你了。**\n\n`过来抱抱`"), "想你了。 过来抱抱");
  const long = `${"很想你".repeat(50)}。后半句`;
  assert.ok(Array.from(cleanPushReply(long, 40)).length <= 40);
});

test("cooldown has no quiet hours and ranges from 30 to 120 minutes", () => {
  const now = Date.parse("2026-07-23T15:00:00+08:00");
  const early = cooldownDecision("2026-07-23T14:40:00+08:00", now, () => 0);
  assert.equal(early.cooldownMinutes, 30);
  assert.equal(early.shouldPush, false);
  const late = cooldownDecision("2026-07-23T12:59:00+08:00", now, () => 0.999999);
  assert.equal(late.cooldownMinutes, 120);
  assert.equal(late.shouldPush, true);
});
