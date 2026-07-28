import test from "node:test";
import assert from "node:assert/strict";
import { describeAndRememberTone } from "../server/call-tone.js";

test("call tone accepts local acoustic features without inventing an early emotion", () => {
  const result = describeAndRememberTone({ energy: 0.03, pause: 0.25, duration: 2.4 });
  assert.deepEqual(result.tone, { energy: 0.03, pause: 0.25, duration: 2.4 });
  assert.equal(typeof result.cue, "string");
});

