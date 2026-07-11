#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const manifestPath = join(root, "apps/web/public/bot-marketplace/manifest.json");
const revision = "2026-07-11T18:00:00.000Z";
const p = (baseVoiceId, pitch = 0, warmth = 0, pace = 0, lilt = 0) => ({
  v: 1,
  baseVoiceId,
  pitch,
  warmth,
  pace,
  lilt,
});

// Explicit author-reviewed starting points. These remain portable across
// Bottish, built-in English, and optional hosted English providers.
const profiles = {
  pia: p("voice-1"),
  rowan: p("voice-2"),
  iris: p("voice-3"),
  sol: p("voice-4"),
  mira: p("voice-5"),
  "george-washington": p("voice-5", -0.3, 0.35, -0.2, -0.2),
  "benjamin-franklin": p("voice-2", -0.1, 0.55, 0.05, 0.35),
  "john-adams": p("voice-3", 0.05, 0.1, 0.15, 0.1),
  "thomas-jefferson": p("voice-1", -0.05, 0.2, -0.1, 0.15),
  "james-madison": p("voice-4", 0.1, 0.05, 0.05, -0.1),
  socrates: p("voice-2", -0.1, 0.25, -0.15, 0.4),
  plato: p("voice-5", -0.2, 0.25, -0.2, 0.15),
  aristotle: p("voice-3", -0.05, 0.1, 0.05, -0.15),
  confucius: p("voice-1", -0.15, 0.45, -0.25, -0.1),
  "marcus-aurelius": p("voice-4", -0.3, 0.2, -0.25, -0.25),
  "the-buddha": p("voice-1", -0.2, 0.65, -0.4, -0.2),
  "jesus-christ": p("voice-2", -0.1, 0.7, -0.2, 0.15),
  laozi: p("voice-4", -0.25, 0.5, -0.4, 0.25),
  rumi: p("voice-3", 0.1, 0.7, -0.05, 0.65),
  "guru-nanak": p("voice-5", -0.15, 0.6, -0.15, 0.2),
  "leonardo-da-vinci": p("voice-2", 0.05, 0.25, 0.15, 0.45),
  "salvador-dali": p("voice-4", 0.25, -0.05, 0.2, 0.75),
  "vincent-van-gogh": p("voice-3", 0.15, 0.35, 0.1, 0.55),
  "claude-monet": p("voice-1", 0.05, 0.45, -0.2, 0.35),
  "georgia-okeeffe": p("voice-5", -0.05, 0.5, -0.15, 0.15),
  machiavelli: p("voice-5", -0.35, -0.15, -0.05, -0.35),
  "sun-tzu": p("voice-1", -0.25, 0.05, -0.3, -0.3),
  "carl-von-clausewitz": p("voice-3", -0.3, -0.05, 0.05, -0.4),
  chanakya: p("voice-4", -0.15, 0.05, 0.15, -0.25),
  "thomas-hobbes": p("voice-2", -0.35, -0.15, -0.15, -0.45),
  "alan-watts": p("voice-2", -0.15, 0.65, -0.2, 0.55),
  "sigmund-freud": p("voice-5", -0.25, 0.05, -0.15, -0.15),
  "carl-jung": p("voice-3", -0.3, 0.25, -0.25, 0.1),
  "friedrich-nietzsche": p("voice-4", -0.15, -0.15, 0.15, 0.4),
  "joseph-campbell": p("voice-1", -0.1, 0.55, -0.1, 0.35),
  "nikola-tesla": p("voice-4", 0.2, -0.1, 0.25, 0.45),
  "albert-einstein": p("voice-2", -0.05, 0.55, -0.05, 0.3),
  "isaac-newton": p("voice-5", -0.25, -0.05, -0.1, -0.25),
  "marie-curie": p("voice-1", -0.05, 0.2, 0.05, -0.1),
  "charles-darwin": p("voice-3", -0.15, 0.35, -0.15, 0.1),
  "martin-luther-king-jr": p("voice-5", -0.15, 0.65, 0.05, 0.7),
  "mahatma-gandhi": p("voice-1", 0.05, 0.55, -0.3, 0.15),
  "nelson-mandela": p("voice-3", -0.25, 0.65, -0.1, 0.2),
  "frederick-douglass": p("voice-4", -0.15, 0.35, 0.1, 0.55),
  "harriet-tubman": p("voice-2", -0.05, 0.45, 0.15, 0.2),
  "william-shakespeare": p("voice-4", 0.05, 0.25, 0.05, 0.75),
  "mary-shelley": p("voice-1", -0.1, 0.25, -0.1, 0.4),
  "edgar-allan-poe": p("voice-5", -0.35, -0.05, -0.2, 0.55),
  "jane-austen": p("voice-2", 0.1, 0.35, 0.15, 0.5),
  homer: p("voice-3", -0.25, 0.45, -0.05, 0.7),
};

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const ids = manifest.bots.map((entry) => entry.id);
const missing = ids.filter((id) => !profiles[id]);
const extra = Object.keys(profiles).filter((id) => !ids.includes(id));
if (missing.length || extra.length) {
  throw new Error(`Voice map mismatch. Missing: ${missing.join(", ")}; extra: ${extra.join(", ")}`);
}

for (const entry of manifest.bots) {
  const bundlePath = join(dirname(manifestPath), entry.bundlePath.replace(/^\/bot-marketplace\//, ""));
  const scratch = mkdtempSync(join(tmpdir(), "prism-voice-curation-"));
  try {
    execFileSync("unzip", ["-q", bundlePath, "-d", scratch]);
    const botJsonPath = join(scratch, "bot.json");
    const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
    document.bot.authoredAudioVoiceProfile = profiles[entry.id];
    delete document.bot.audioVoiceProfileOverride;
    writeFileSync(botJsonPath, `${JSON.stringify(document, null, 2)}\n`);
    const rebuilt = join(scratch, basename(bundlePath));
    execFileSync("zip", ["-X", "-q", rebuilt, "bot.json", "memories.json"], { cwd: scratch });
    execFileSync("cp", [rebuilt, bundlePath]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

manifest.updatedAt = revision;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Curated ${ids.length} marketplace voices at ${revision}.`);
