#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const MARKETPLACE = join(ROOT, "apps/web/public/bot-marketplace");
const MANIFEST_PATH = join(MARKETPLACE, "manifest.json");
const UPDATED_AT = "2026-07-11T20:00:00.000Z";

const recipes = {
  clean: { preset: "clean", amount: 0, bandwidth: 1, noise: 0, instability: 0, distortion: 0, damage: 0 },
  "crt-speaker": { preset: "crt-speaker", amount: 0.65, bandwidth: 0.35, noise: 0.05, instability: 0.02, distortion: 0.12, damage: 0.05 },
  lofi: { preset: "lofi", amount: 0.65, bandwidth: 0.45, noise: 0.15, instability: 0.08, distortion: 0.25, damage: 0.1 },
  tape: { preset: "tape", amount: 0.65, bandwidth: 0.8, noise: 0.22, instability: 0.35, distortion: 0.22, damage: 0.08 },
  "damaged-speaker": { preset: "damaged-speaker", amount: 0.65, bandwidth: 0.3, noise: 0.28, instability: 0.18, distortion: 0.45, damage: 0.65 },
};

// Deliberately authored bot-by-bot. These choices are persona texture, not
// theme-pack defaults; Amount stays restrained enough to keep every voice clear.
const personaTexture = {
  pia: ["clean", 0], rowan: ["clean", 0], iris: ["clean", 0], sol: ["clean", 0], mira: ["clean", 0],
  "george-washington": ["crt-speaker", 0.42], "benjamin-franklin": ["tape", 0.38], "john-adams": ["crt-speaker", 0.5], "thomas-jefferson": ["lofi", 0.32], "james-madison": ["tape", 0.3],
  socrates: ["lofi", 0.28], plato: ["tape", 0.34], aristotle: ["crt-speaker", 0.26], confucius: ["clean", 0], "marcus-aurelius": ["tape", 0.25],
  "the-buddha": ["clean", 0], "jesus-christ": ["tape", 0.2], laozi: ["lofi", 0.18], rumi: ["tape", 0.36], "guru-nanak": ["crt-speaker", 0.22],
  "leonardo-da-vinci": ["tape", 0.42], "salvador-dali": ["damaged-speaker", 0.48], "vincent-van-gogh": ["lofi", 0.52], "claude-monet": ["tape", 0.3], "georgia-okeeffe": ["crt-speaker", 0.25],
  machiavelli: ["crt-speaker", 0.48], "sun-tzu": ["tape", 0.25], "carl-von-clausewitz": ["damaged-speaker", 0.4], chanakya: ["lofi", 0.34], "thomas-hobbes": ["crt-speaker", 0.58],
  "alan-watts": ["tape", 0.5], "sigmund-freud": ["lofi", 0.36], "carl-jung": ["tape", 0.44], "friedrich-nietzsche": ["damaged-speaker", 0.46], "joseph-campbell": ["crt-speaker", 0.3],
  "nikola-tesla": ["damaged-speaker", 0.52], "albert-einstein": ["tape", 0.3], "isaac-newton": ["crt-speaker", 0.42], "marie-curie": ["lofi", 0.25], "charles-darwin": ["tape", 0.34],
  "martin-luther-king-jr": ["crt-speaker", 0.3], "mahatma-gandhi": ["lofi", 0.2], "nelson-mandela": ["tape", 0.28], "frederick-douglass": ["crt-speaker", 0.45], "harriet-tubman": ["damaged-speaker", 0.24],
  "william-shakespeare": ["tape", 0.5], "mary-shelley": ["damaged-speaker", 0.5], "edgar-allan-poe": ["damaged-speaker", 0.62], "jane-austen": ["lofi", 0.28], homer: ["crt-speaker", 0.4],
};

const originalVoiceSlots = { pia: "voice-1", rowan: "voice-2", iris: "voice-3", sol: "voice-4", mira: "voice-5" };
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const sacredThemeId = "sacred-spiritual-teachers";
const sacredBotIds = ["the-buddha", "jesus-christ", "laozi", "rumi", "guru-nanak"];
manifest.themes = manifest.themes.filter((theme) => theme.id !== sacredThemeId);
for (const bot of manifest.bots) {
  if (sacredBotIds.includes(bot.id)) bot.themeIds = [];
}
const missing = manifest.bots.map((bot) => bot.id).filter((id) => !personaTexture[id]);
if (missing.length) throw new Error(`Missing persona voice texture choices: ${missing.join(", ")}`);

for (const entry of manifest.bots) {
  const archivePath = join(MARKETPLACE, entry.bundlePath.replace(/^\/bot-marketplace\//u, ""));
  const work = mkdtempSync(join(tmpdir(), `prism-voice-${entry.id}-`));
  try {
    execFileSync("unzip", ["-qq", archivePath, "-d", work]);
    const botJsonPath = join(work, "bot.json");
    const bundle = JSON.parse(readFileSync(botJsonPath, "utf8"));
    const previous = bundle.bot?.authoredAudioVoiceProfile ?? {};
    const [preset, amount] = personaTexture[entry.id];
    bundle.exportedAt = UPDATED_AT;
    bundle.bot.authoredAudioVoiceProfile = {
      v: 2,
      enabled: true,
      baseVoiceId: originalVoiceSlots[entry.id] ?? previous.baseVoiceId ?? "voice-1",
      pitch: previous.pitch ?? 0,
      warmth: previous.warmth ?? 0,
      pace: previous.pace ?? 0,
      lilt: previous.lilt ?? 0,
      bottishTone: previous.bottishTone ?? previous.signal ?? 0.45,
      volume: 1,
      texture: { ...recipes[preset], amount },
    };
    writeFileSync(botJsonPath, `${JSON.stringify(bundle, null, 2)}\n`);
    const files = ["bot.json", "memories.json"].filter((name) => {
      try { readFileSync(join(work, name)); return true; } catch { return false; }
    });
    rmSync(archivePath, { force: true });
    execFileSync("zip", ["-q", "-X", archivePath, ...files], { cwd: work });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

manifest.updatedAt = UPDATED_AT;
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Migrated ${manifest.bots.length} marketplace bot bundles to authored voice profile v2.`);
