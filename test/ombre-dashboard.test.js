import test from "node:test";
import assert from "node:assert/strict";
import { dashboardItems, normalizeOmbreBucket } from "../server/ombre-dashboard.js";

test("normalizes Ombre Dashboard field variants for the frontend", () => {
  const item = normalizeOmbreBucket({
    bucket_id: "memory-7",
    title: "雨夜散步",
    body: "  一起走过很长的路。\n记得那天很安静。 ",
    content_preview: "雨夜的散步",
    metadata: {
      type: "Permanent",
      domains: "relationship, daily",
      tags: ["warm"],
      importance: "12",
      pinned: "true",
      activation_count: "4"
    },
    createdAt: "2026-07-20T12:00:00Z",
    last_active: "2026-07-28T10:00:00Z"
  });

  assert.equal(item.id, "memory-7");
  assert.equal(item.name, "雨夜散步");
  assert.equal(item.type, "permanent");
  assert.deepEqual(item.domains, ["relationship", "daily"]);
  assert.deepEqual(item.tags, ["warm"]);
  assert.equal(item.importance, 10);
  assert.equal(item.pinned, true);
  assert.equal(item.activationCount, 4);
  assert.equal(item.contentPreview, "雨夜的散步");
  assert.equal(item.lastActiveAt, "2026-07-28T10:00:00Z");
});

test("extracts and filters bucket collections from dashboard responses", () => {
  const items = dashboardItems({
    results: [
      { id: "a", name: "A", content: "first" },
      { name: "", content: "missing id" },
      { id: "b", summary: "second" }
    ]
  });

  assert.deepEqual(items.map((item) => item.id), ["a", "b"]);
  assert.equal(items[1].content, "second");
});
