import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const profilePath = join(process.cwd(), "data", "call-tone-profile.json");
const limit = 400;

function percentile(values, value) {
  if (values.length < 25) return null;
  const below = values.filter((item) => item <= value).length;
  return below / values.length;
}

function readProfile() {
  try {
    if (existsSync(profilePath)) return JSON.parse(readFileSync(profilePath, "utf8"));
  } catch (error) {
    console.warn("[call-tone] profile read failed:", error.message);
  }
  return { energy: [], pause: [], duration: [] };
}

const profile = readProfile();

function saveProfile() {
  try {
    mkdirSync(dirname(profilePath), { recursive: true });
    writeFileSync(profilePath, JSON.stringify(profile));
  } catch (error) {
    console.warn("[call-tone] profile write failed:", error.message);
  }
}

export function describeAndRememberTone(tone) {
  if (!tone) return { cue: "", tone: null };
  const normalized = {
    energy: Math.max(0, Math.min(1, Number(tone.energy) || 0)),
    pause: Math.max(0, Math.min(1, Number(tone.pause) || 0)),
    duration: Math.max(0, Math.min(30, Number(tone.duration) || 0))
  };
  const energyRank = percentile(profile.energy, normalized.energy);
  const pauseRank = percentile(profile.pause, normalized.pause);
  const cues = [];
  if (energyRank !== null && energyRank <= 0.12) cues.push("声音比平时轻");
  else if (energyRank !== null && energyRank >= 0.88) cues.push("声音比平时有力");
  if (pauseRank !== null && pauseRank >= 0.88) cues.push("停顿比平时多");
  else if (pauseRank !== null && pauseRank <= 0.12) cues.push("说得比平时连贯");
  for (const key of Object.keys(profile)) {
    profile[key].push(normalized[key]);
    if (profile[key].length > limit) profile[key].splice(0, profile[key].length - limit);
  }
  saveProfile();
  return { cue: cues.join("，"), tone: normalized };
}

