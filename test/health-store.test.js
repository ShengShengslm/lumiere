import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { HealthStore, normalizeHealthPayload, normalizeHealthType } from "../server/health-store.js";

const payload = {
  data: {
    metrics: [
      { name: "heart_rate", units: "count/min", data: [
        { date: "2026-07-24T12:00:00Z", qty: 72 },
        { date: "2026-07-24T12:05:00Z", qty: 75 }
      ] },
      { name: "step_count", units: "count", data: [
        { date: "2026-07-24T12:05:00Z", qty: 3210 }
      ] }
    ]
  }
};

test("normalizes Health Auto Export metrics", () => {
  const rows = normalizeHealthPayload(payload);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.type), ["heart_rate", "heart_rate", "steps"]);
});

test("normalizes Health Auto Export special heart-rate format", () => {
  const rows = normalizeHealthPayload({
    data: { metrics: [{
      name: "heart_rate",
      units: "bpm",
      data: [{ date: "2026-07-26 20:30:00 +0800", Min: 83, Avg: 85, Max: 86 }]
    }] }
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, "heart_rate");
  assert.equal(rows[0].value_number, 85);
  assert.equal(rows[0].unit, "bpm");
  assert.equal(rows[0].raw.Min, 83);
  assert.equal(rows[0].raw.Max, 86);
});

test("normalizes Health Auto Export blood oxygen type", () => {
  assert.equal(normalizeHealthType("blood_oxygen_saturation"), "blood_oxygen");
});

test("stores, deduplicates and queries health records", () => {
  const path = join(process.cwd(), "tmp", `health-${process.pid}.sqlite`);
  rmSync(path, { force: true });
  const store = new HealthStore(path);
  const now = new Date();
  const recentPayload = {
    data: { metrics: [
      { name: "heart_rate", units: "count/min", data: [
        { date: new Date(now.getTime() - 5 * 60_000).toISOString(), qty: 72 },
        { date: now.toISOString(), qty: 75 }
      ] },
      { name: "step_count", units: "count", data: [
        { date: now.toISOString(), qty: 3210 }
      ] }
    ] }
  };
  const first = store.insertPayload(recentPayload);
  assert.equal(first.received, 3);
  assert.equal(first.inserted, 3);
  assert.equal(store.insertPayload(recentPayload).inserted, 0);
  assert.equal(store.latest("heart_rate").value, 75);
  assert.equal(store.latest().length, 2);
  assert.equal(store.range({
    type: "heart_rate",
    from: new Date(now.getTime() - 60_000).toISOString(),
    to: new Date(now.getTime() + 60_000).toISOString()
  }).length, 1);
  const old = store.insertPayload({
    type: "heart_rate", value: 99, unit: "bpm",
    timestamp: new Date(now.getTime() - 4 * 24 * 60 * 60_000).toISOString()
  });
  assert.equal(old.discarded_old, 1);
  assert.equal(store.latest("heart_rate").value, 75);
  store.db.close();
  rmSync(path, { force: true });
});
