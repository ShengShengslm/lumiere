import test from "node:test";
import assert from "node:assert/strict";
import { mcpText, parseMcpResponse } from "../server/ombre.js";

test("parses an SSE MCP response", () => {
  const parsed = parseMcpResponse('event: message\ndata: {"jsonrpc":"2.0","result":{"content":[]}}\n\n');
  assert.equal(parsed.jsonrpc, "2.0");
});

test("parses a JSON MCP response", () => assert.deepEqual(parseMcpResponse('{"ok":true}'), { ok: true }));

test("joins only textual MCP content", () => {
  assert.equal(mcpText({ result: { content: [{ type: "text", text: "one" }, { type: "image", data: "x" }, { type: "text", text: "two" }] } }), "one\ntwo");
});
