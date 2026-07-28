import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";

const roots = ["dynamic", "permanent", "feel"];

function scalar(value = "") {
  const text = value.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return text;
}

export function parseOmbreMarkdown(text, fallbackId = "") {
  const source = String(text || "");
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (field) metadata[field[1]] = scalar(field[2]);
  }
  const content = match[2].trim();
  const created = metadata.created || metadata.created_at;
  if (!content || !created || Number.isNaN(Date.parse(String(created)))) return null;
  return {
    id: `ombre:${metadata.id || fallbackId}`,
    session_id: null,
    summary: content,
    created_at: new Date(String(created)).toISOString(),
    sessions: { name: "Ombre Brain" },
    metadata: {
      source: "ombre",
      name: String(metadata.name || "情绪记忆"),
      type: String(metadata.type || "memory"),
      domain: metadata.domain || "",
      importance: metadata.importance ?? null,
      valence: metadata.valence ?? null,
      arousal: metadata.arousal ?? null
    }
  };
}

async function markdownFiles(directory) {
  const files = [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return files; }
  for (const entry of entries) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(child));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(child);
  }
  return files;
}

export async function listOmbreMemories() {
  if (!config.ombre.vaultPath) return [];
  const files = (await Promise.all(roots.map((root) => markdownFiles(join(config.ombre.vaultPath, root))))).flat();
  const memories = await Promise.all(files.map(async (file, index) => {
    try { return parseOmbreMarkdown(await readFile(file, "utf8"), String(index + 1)); } catch { return null; }
  }));
  return memories.filter(Boolean).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function updateOmbreMemory(memoryId, summary) {
  if (!config.ombre.vaultPath) return null;
  const cleanId = String(memoryId || "").replace(/^ombre:/, "");
  const files = (await Promise.all(roots.map((root) => markdownFiles(join(config.ombre.vaultPath, root))))).flat();
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const source = await readFile(file, "utf8");
    const memory = parseOmbreMarkdown(source, String(index + 1));
    if (!memory || memory.id !== `ombre:${cleanId}`) continue;
    const match = source.match(/^(---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?)[\s\S]*$/);
    if (!match) return null;
    await writeFile(file, `${match[1]}${summary.trim()}\n`, "utf8");
    return parseOmbreMarkdown(`${match[1]}${summary.trim()}\n`, cleanId);
  }
  return null;
}
