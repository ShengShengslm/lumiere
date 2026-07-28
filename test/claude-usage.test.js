import test from "node:test";
import assert from "node:assert/strict";
import { normalizeClaudeUsage } from "../server/claude-usage.js";

test("normalizes Claude five-hour and weekly utilization", () => {
  assert.deepEqual(normalizeClaudeUsage({
    five_hour: { utilization: 37.4, resets_at: "2026-07-23T13:50:00Z" },
    seven_day: { utilization: 61.8, resets_at: "2026-07-27T00:00:00Z" }
  }), {
    available: true,
    fiveHour: { usedPercent: 37, resetsAt: "2026-07-23T13:50:00Z" },
    sevenDay: { usedPercent: 62, resetsAt: "2026-07-27T00:00:00Z" }
  });
});

test("marks missing Claude usage as unavailable", () => {
  assert.equal(normalizeClaudeUsage({}).available, false);
});
