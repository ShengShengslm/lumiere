import { store } from "./store.js";

const safeDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : new Date().toISOString().slice(0, 10);

const normalize = (row, includeLocked = false) => {
  const visible = row.metadata?.visible === true;
  return {
    id: row.id,
    date: row.metadata?.diary_date || String(row.created_at).slice(0, 10),
    title: row.metadata?.name || "无题",
    visible,
    content: visible || includeLocked ? row.summary : null,
    created_at: row.created_at
  };
};

export async function listDiary({ includeLocked = false } = {}) {
  return (await store.listDiaryRows()).map((row) => normalize(row, includeLocked));
}

export async function writeDiary(sessionId, { date, title, content, visible = false }) {
  const diaryDate = safeDate(date);
  const entries = await store.listDiaryRows();
  const existing = entries.find((row) => row.metadata?.diary_date === diaryDate);
  const value = {
    date: diaryDate,
    title: String(title || "无题").trim().slice(0, 80),
    content: String(content || "").trim().slice(0, 20_000),
    visible: visible === true
  };
  if (!value.content) throw new Error("日记正文不能为空");
  const row = existing
    ? await store.updateDiaryRow(existing.id, value)
    : await store.addDiaryRow(sessionId, value);
  return normalize(row, true);
}

export async function unlockDiary(id) {
  const row = await store.updateDiaryRow(Number(id), { visible: true });
  return row ? normalize(row, true) : null;
}
