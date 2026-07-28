import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";

async function walk(path) {
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}

export async function cleanBackedUpVoiceCache(now = Date.now()) {
  const files = await walk(config.elevenlabs.cachePath);
  const cutoff = now - config.elevenlabs.cacheRetentionDays * 24 * 60 * 60_000;
  let removed = 0;
  for (const marker of files.filter((file) => file.endsWith(".mp3.backed-up"))) {
    const audio = marker.slice(0, -".backed-up".length);
    const info = await stat(audio).catch(() => null);
    if (!info || info.mtimeMs >= cutoff) continue;
    await rm(audio, { force: true });
    await rm(marker, { force: true });
    removed += 1;
  }
  if (removed) console.log(`[voice-cache] removed ${removed} locally-backed-up files`);
  return { removed };
}

