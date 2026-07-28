import { config } from "./config.js";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();

export const elevenLabsStatus = () => ({
  configured: Boolean(config.elevenlabs.apiKey && config.elevenlabs.voiceId),
  model: config.elevenlabs.modelId
});

export async function synthesizeSpeech(text) {
  const spoken = cleanText(text);
  if (!spoken) throw Object.assign(new Error("没有可朗读的文字"), { status: 400 });
  if (spoken.length > 4000) throw Object.assign(new Error("单次朗读请控制在 4000 字符内"), { status: 400 });
  if (!config.elevenlabs.apiKey || !config.elevenlabs.voiceId) {
    throw Object.assign(new Error("ElevenLabs 尚未配置 API Key 或 Voice ID"), { status: 503 });
  }
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const [year, month, date] = day.split("-");
  const cacheKey = createHash("sha256")
    .update([config.elevenlabs.voiceId, config.elevenlabs.modelId, config.elevenlabs.outputFormat, spoken].join("\n"))
    .digest("hex");
  const cacheDir = join(config.elevenlabs.cachePath, year, month, date);
  const cacheFile = join(cacheDir, `${cacheKey}.mp3`);
  try {
    const cached = await readFile(cacheFile);
    if (cached.length > 100) return cached;
  } catch {}
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.elevenlabs.voiceId)}?output_format=${encodeURIComponent(config.elevenlabs.outputFormat)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/mpeg", "xi-api-key": config.elevenlabs.apiKey },
    body: JSON.stringify({
      text: spoken,
      model_id: config.elevenlabs.modelId,
      voice_settings: { stability: 0.48, similarity_boost: 0.78, style: 0.18, use_speaker_boost: true }
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[elevenlabs]", response.status, detail.slice(0, 500));
    throw Object.assign(new Error(response.status === 401 ? "ElevenLabs 密钥无效" : `ElevenLabs 合成失败 (${response.status})`), { status: 502 });
  }
  const audio = Buffer.from(await response.arrayBuffer());
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cacheFile, audio);
  return audio;
}

export async function transcribeSpeech(audio, contentType = "audio/webm") {
  if (!Buffer.isBuffer(audio) || audio.length < 100) throw Object.assign(new Error("没有收到有效录音"), { status: 400 });
  if (!config.elevenlabs.apiKey) throw Object.assign(new Error("ElevenLabs 尚未配置 API Key"), { status: 503 });
  const form = new FormData();
  const extension = contentType.includes("mp4") ? "m4a" : contentType.includes("ogg") ? "ogg" : "webm";
  form.append("file", new Blob([audio], { type: contentType }), `lumiere-call.${extension}`);
  form.append("model_id", "scribe_v2");
  form.append("tag_audio_events", "false");
  form.append("diarize", "false");
  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": config.elevenlabs.apiKey },
    body: form
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[elevenlabs-stt]", response.status, JSON.stringify(data).slice(0, 500));
    throw Object.assign(new Error(response.status === 401 ? "ElevenLabs 密钥无效" : `语音识别失败 (${response.status})`), { status: 502 });
  }
  return { text: String(data.text || "").trim(), language: data.language_code || "" };
}
