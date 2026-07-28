import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

const aliases = new Map([
  ["heartrate", "heart_rate"], ["heart_rate", "heart_rate"], ["心率", "heart_rate"],
  ["oxygen_saturation", "blood_oxygen"], ["blood_oxygen_saturation", "blood_oxygen"], ["bloodoxygen", "blood_oxygen"], ["blood_oxygen", "blood_oxygen"], ["血氧", "blood_oxygen"],
  ["stepcount", "steps"], ["step_count", "steps"], ["steps", "steps"], ["步数", "steps"],
  ["sleepanalysis", "sleep"], ["sleep_analysis", "sleep"], ["sleep", "sleep"], ["睡眠", "sleep"],
  ["bodymass", "weight"], ["body_mass", "weight"], ["weight", "weight"], ["体重", "weight"],
  ["bloodpressure", "blood_pressure"], ["blood_pressure", "blood_pressure"], ["血压", "blood_pressure"]
]);

export const normalizeHealthType = (value) => {
  const key = String(value || "unknown").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return aliases.get(key) || aliases.get(key.replaceAll("_", "")) || key;
};

const timestamp = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error(`无效健康数据时间: ${value}`), { status: 400 });
  return date.toISOString();
};

const retentionCutoff = (days = config.health.retentionDays, now = new Date()) => {
  const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayUtc = Date.UTC(shanghai.getUTCFullYear(), shanghai.getUTCMonth(), shanghai.getUTCDate());
  return new Date(todayUtc - 8 * 60 * 60 * 1000 - (days - 1) * 24 * 60 * 60 * 1000).toISOString();
};

const first = (object, keys) => keys.find((key) => object[key] !== undefined);
const recordFrom = (item, inheritedType, inheritedUnit) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const typeKey = first(item, ["type", "name", "metric", "dataType", "data_type"]);
  const timeKey = first(item, ["timestamp", "date", "startDate", "start_date", "endDate", "end_date", "time"]);
  const valueKey = first(item, [
    "value", "qty", "quantity", "amount", "total", "duration",
    "Avg", "avg", "average", "totalSleep", "asleep"
  ]);
  if (!timeKey) return null;
  const bloodPressure = item.systolic !== undefined && item.diastolic !== undefined
    ? `${item.systolic}/${item.diastolic}`
    : null;
  if (!valueKey && bloodPressure === null) return null;
  const value = valueKey ? item[valueKey] : bloodPressure;
  if (value === null || typeof value === "object") return null;
  return {
    type: normalizeHealthType(typeKey ? item[typeKey] : inheritedType),
    value: String(value),
    value_number: Number.isFinite(Number(value)) ? Number(value) : null,
    unit: String(item.unit ?? item.units ?? inheritedUnit ?? ""),
    timestamp: timestamp(item[timeKey]),
    raw: item
  };
};

export function normalizeHealthPayload(payload) {
  const records = [];
  const seen = new Set();
  const walk = (node, inheritedType = "", inheritedUnit = "") => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) return node.forEach((item) => walk(item, inheritedType, inheritedUnit));
    const type = node.type ?? node.name ?? node.metric ?? inheritedType;
    const unit = node.unit ?? node.units ?? inheritedUnit;
    const record = recordFrom(node, type, unit);
    if (record) records.push(record);
    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== "object") continue;
      const childType = ["data", "metrics", "samples", "records", "values"].includes(key) ? type : (type || key);
      walk(value, childType, unit);
    }
  };
  walk(payload);
  return records;
}

class HealthStore {
  constructor(path = config.health.dbPath) { this.path = path; this.db = null; }
  open() {
    if (this.db) return this.db;
    mkdirSync(dirname(this.path), { recursive: true });
    this.db = new DatabaseSync(this.path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS health_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_type TEXT NOT NULL,
        value_text TEXT NOT NULL,
        value_number REAL,
        unit TEXT NOT NULL DEFAULT '',
        recorded_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        UNIQUE(data_type, recorded_at, value_text, unit)
      );
      CREATE INDEX IF NOT EXISTS health_type_time ON health_records(data_type, recorded_at DESC);
    `);
    return this.db;
  }
  insertPayload(payload) {
    const cutoff = retentionCutoff();
    const parsed = normalizeHealthPayload(payload);
    const rows = parsed.filter((row) => row.timestamp >= cutoff);
    const receivedAt = new Date().toISOString();
    const statement = this.open().prepare(`
      INSERT OR IGNORE INTO health_records
      (data_type,value_text,value_number,unit,recorded_at,received_at,raw_json)
      VALUES (?,?,?,?,?,?,?)
    `);
    let inserted = 0;
    this.open().exec("BEGIN");
    try {
      this.open().prepare("DELETE FROM health_records WHERE recorded_at < ?").run(cutoff);
      for (const row of rows) {
        const result = statement.run(row.type, row.value, row.value_number, row.unit, row.timestamp, receivedAt, JSON.stringify(row.raw));
        inserted += Number(result.changes);
      }
      this.open().exec("COMMIT");
    } catch (error) {
      this.open().exec("ROLLBACK");
      throw error;
    }
    return {
      received: parsed.length,
      inserted,
      discarded_old: parsed.length - rows.length,
      retained_from: cutoff,
      synced_at: receivedAt
    };
  }
  map(row) {
    if (!row) return null;
    return {
      id: Number(row.id), type: row.data_type,
      value: row.value_number ?? row.value_text, unit: row.unit,
      timestamp: row.recorded_at, received_at: row.received_at,
      raw: JSON.parse(row.raw_json)
    };
  }
  latest(type = "") {
    const db = this.open();
    if (type) return this.map(db.prepare("SELECT * FROM health_records WHERE data_type=? ORDER BY recorded_at DESC,id DESC LIMIT 1").get(normalizeHealthType(type)));
    return db.prepare(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER(PARTITION BY data_type ORDER BY recorded_at DESC,id DESC) AS rn
        FROM health_records
      ) WHERE rn=1 ORDER BY data_type
    `).all().map((row) => this.map(row));
  }
  range({ type = "", from, to }) {
    const conditions = ["recorded_at>=?", "recorded_at<=?"];
    const values = [timestamp(from), timestamp(to)];
    if (type) { conditions.push("data_type=?"); values.push(normalizeHealthType(type)); }
    return this.open().prepare(`SELECT * FROM health_records WHERE ${conditions.join(" AND ")} ORDER BY recorded_at,id`).all(...values).map((row) => this.map(row));
  }
}

export const healthStore = new HealthStore();
export { HealthStore };
