#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  normalizeBotAudioVoiceProfileV1,
  prismBuiltinEnglishVoice,
} from "@localai/shared";

const root = resolve(import.meta.dirname, "..");
const marketplaceRoot = join(root, "apps/web/public/bot-marketplace");
const manifestPath = join(marketplaceRoot, "manifest.json");
const allowlistPath = join(root, "steam-marketplace-allowlist.json");
const revision = "2026-08-02T18:45:00.000Z";

const t = (openness, weight, brightness, resonance, gainDb = 0) => ({
  openness,
  weight,
  brightness,
  resonance,
  gainDb,
});

// Deliberate Voice Character casting for the Steam-safe shelf. The existing
// portable archetype, pitch, warmth, delivery, and preview line remain the
// foundation; these local-only controls give Voice+ an authored vocal tract
// rather than the neutral account default.
const VOICE_PLUS_TONE_BY_ID = {
  pia: t(-0.15, -0.15, 0.35, 0.1, -0.5),
  rowan: t(-0.25, 0.1, 0.05, 0.25),
  iris: t(0.15, -0.1, 0.25, 0, -0.5),
  sol: t(-0.2, -0.15, 0.4, 0.1),
  mira: t(0.05, 0.25, 0.1, 0.3),
  "george-washington": t(-0.05, 0.35, -0.1, 0.35),
  "benjamin-franklin": t(-0.2, 0.15, 0.2, 0.2),
  "john-adams": t(0.1, 0.25, 0.2, 0.15, 0.5),
  "thomas-jefferson": t(-0.15, 0.05, 0.15, 0.15),
  "james-madison": t(0.05, 0, 0.05, 0.2, -0.5),
  socrates: t(-0.1, 0.05, 0.15, 0.2),
  plato: t(-0.2, 0.25, -0.05, 0.35),
  aristotle: t(0, 0.2, 0, 0.25),
  confucius: t(-0.2, 0.05, -0.15, 0.3, -0.5),
  "marcus-aurelius": t(-0.15, 0.4, -0.2, 0.45),
  "the-buddha": t(-0.35, 0, -0.25, 0.35, -1),
  "jesus-christ": t(-0.3, 0.1, -0.05, 0.3),
  laozi: t(-0.4, -0.1, -0.2, 0.2, -1),
  rumi: t(-0.35, -0.1, 0.2, 0.3),
  "guru-nanak": t(-0.25, 0.15, -0.05, 0.35),
  "leonardo-da-vinci": t(-0.1, -0.05, 0.3, 0.15),
  "salvador-dali": t(0.15, 0.05, 0.4, 0.2, 0.5),
  "vincent-van-gogh": t(-0.05, -0.1, 0.15, 0.1),
  "claude-monet": t(-0.3, -0.15, 0.05, 0.2, -0.5),
  "georgia-okeeffe": t(-0.25, 0.2, -0.05, 0.3),
  machiavelli: t(0.05, 0.2, 0.1, 0.25),
  "sun-tzu": t(-0.1, 0.25, -0.2, 0.35, -0.5),
  "carl-von-clausewitz": t(0.1, 0.5, -0.2, 0.5, 0.5),
  chanakya: t(0.15, 0.15, 0, 0.25),
  "thomas-hobbes": t(0.1, 0.45, -0.3, 0.45),
  "alan-watts": t(-0.35, 0.05, -0.1, 0.4, -0.5),
  "sigmund-freud": t(0.15, 0.1, -0.05, 0.25),
  "carl-jung": t(-0.2, 0.45, -0.25, 0.55),
  "friedrich-nietzsche": t(0.05, 0.4, 0.05, 0.4, 0.5),
  "joseph-campbell": t(-0.3, 0.2, 0.05, 0.35),
  "nikola-tesla": t(0, -0.05, 0.35, 0.15, -0.5),
  "albert-einstein": t(-0.25, 0, 0.1, 0.25),
  "isaac-newton": t(0.05, 0.3, -0.1, 0.35),
  "marie-curie": t(0, 0.05, 0.15, 0.2, -0.5),
  "charles-darwin": t(-0.2, 0.15, -0.05, 0.3),
  "martin-luther-king-jr": t(-0.2, 0.5, 0.15, 0.55, 1),
  "mahatma-gandhi": t(-0.3, -0.05, -0.15, 0.25, -1),
  "nelson-mandela": t(-0.25, 0.45, -0.1, 0.5, 0.5),
  "frederick-douglass": t(-0.05, 0.6, 0.1, 0.6, 1),
  "harriet-tubman": t(-0.1, 0.35, -0.1, 0.4),
  "william-shakespeare": t(-0.05, 0.05, 0.3, 0.25, 0.5),
  "mary-shelley": t(-0.2, 0.05, -0.05, 0.3, -0.5),
  "edgar-allan-poe": t(0, 0.45, -0.35, 0.55, -0.5),
  "jane-austen": t(0, -0.05, 0.25, 0.15),
  homer: t(-0.25, 0.55, -0.15, 0.55, 0.5),
  "silent-jack": t(0.05, 0.2, -0.1, 0.25, -1),
  "lazy-cameron": t(-0.35, -0.2, -0.3, 0.05, -1),
  "interrupting-tom": t(0.15, 0.25, 0.25, 0.2, 0.5),
  "copycat-calvin": t(0, 0, 0.1, 0.1, -0.5),
  "joyful-nora": t(-0.25, -0.2, 0.4, 0.15, 0.5),
  "mumbling-jim": t(0.45, 0.05, -0.35, 0.1, -1.5),
  "obsessed-kevin": t(-0.1, -0.15, 0.3, 0.1, 0.5),
  "sad-sally": t(0.4, 0.2, -0.35, 0.2, -1),
  "alias-avery": t(-0.05, -0.05, 0.15, 0.15),
  "shapeshifter-sam": t(-0.15, -0.1, 0.25, 0.2),
  "identity-crisis-ian": t(0.3, 0.25, 0.05, 0.2, -0.5),
  "crazy-brenda": t(0.25, 0.05, 0.45, 0.1, 0.5),
  "forgetful-freddie": t(-0.05, -0.15, 0.2, 0.05, -0.5),
  "tiny-bill": t(-0.2, -0.55, 0.55, -0.1, -1),
};

const shouldApply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
const backupArgument = (() => {
  const index = process.argv.indexOf("--workspace-backup");
  return index >= 0 ? process.argv[index + 1] : null;
})();
if (shouldApply === dryRun) {
  throw new Error("Choose exactly one of --dry-run or --apply.");
}
if (shouldApply && !backupArgument) {
  throw new Error("Applying Voice+ updates requires --workspace-backup PATH.");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function bundlePathFor(entry) {
  return join(
    marketplaceRoot,
    entry.bundlePath.replace(/^\/bot-marketplace\//u, ""),
  );
}

function protectedDocumentHash(document) {
  const protectedDocument = structuredClone(document);
  delete protectedDocument.exportedAt;
  delete protectedDocument.bot.authoredAudioVoiceProfile;
  return sha256(JSON.stringify(protectedDocument));
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
const approvedIds = allowlist.approvedBotIds;
const approvedSet = new Set(approvedIds);
const manifestById = new Map(manifest.bots.map((entry) => [entry.id, entry]));
const missingEntries = approvedIds.filter((id) => !manifestById.has(id));
const missingRecipes = approvedIds.filter((id) => !VOICE_PLUS_TONE_BY_ID[id]);
const extraRecipes = Object.keys(VOICE_PLUS_TONE_BY_ID).filter(
  (id) => !approvedSet.has(id),
);
if (missingEntries.length || missingRecipes.length || extraRecipes.length) {
  throw new Error(
    `Voice+ map mismatch. Missing bundles: ${missingEntries.join(", ")}; missing recipes: ${missingRecipes.join(", ")}; extra recipes: ${extraRecipes.join(", ")}`,
  );
}

function readTarget(id) {
  const entry = manifestById.get(id);
  const bundlePath = bundlePathFor(entry);
  const entryNames = execFileSync("unzip", ["-Z1", bundlePath], {
    encoding: "utf8",
  })
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean);
  const document = JSON.parse(
    execFileSync("unzip", ["-p", bundlePath, "bot.json"], {
      encoding: "utf8",
    }),
  );
  if (document.botHash !== entry.botHash || document.bot?.name !== entry.name) {
    throw new Error(`${entry.name} bundle identity does not match the manifest.`);
  }
  const profile = normalizeBotAudioVoiceProfileV1(
    document.bot.authoredAudioVoiceProfile,
  );
  const tone = VOICE_PLUS_TONE_BY_ID[id];
  const desiredProfile = {
    ...profile,
    localEnginePreference: "voice-plus",
    localVoiceSource: "portable",
    accentLocale: prismBuiltinEnglishVoice(profile.baseVoiceId).locale,
    accentMode: "prefer-genuine",
    speechprintInfluence: "none",
    speechprintStrength: "balanced",
    speechprintVariationSeed: `marketplace-${id}`.slice(0, 64),
    ...tone,
    eqTilt: tone.brightness,
  };
  for (const field of [
    "systemVoiceName",
    "localReferenceId",
    "elevenLabsVoiceId",
    "elevenLabsVoiceIdOverride",
    "elevenLabsVoiceInitialized",
  ]) {
    delete desiredProfile[field];
  }
  return {
    id,
    entry,
    bundlePath,
    entryNames,
    document,
    desiredProfile,
    protectedHash: protectedDocumentHash(document),
    memoriesHash: entryNames.includes("memories.json")
      ? sha256(execFileSync("unzip", ["-p", bundlePath, "memories.json"]))
      : null,
    changed:
      JSON.stringify(document.bot.authoredAudioVoiceProfile) !==
      JSON.stringify(desiredProfile),
  };
}

const targets = approvedIds.map(readTarget);
let backupPath = null;
if (shouldApply) {
  backupPath = resolve(backupArgument);
  if (existsSync(backupPath)) {
    throw new Error(`Refusing to overwrite workspace backup: ${backupPath}`);
  }
  mkdirSync(backupPath, { recursive: true });
  copyFileSync(manifestPath, join(backupPath, "manifest.json"));
  copyFileSync(allowlistPath, join(backupPath, "steam-marketplace-allowlist.json"));
  for (const target of targets) {
    copyFileSync(target.bundlePath, join(backupPath, basename(target.bundlePath)));
  }

  for (const target of targets.filter(({ changed }) => changed)) {
    const scratch = mkdtempSync(join(tmpdir(), "prism-marketplace-voice-plus-"));
    try {
      execFileSync("unzip", ["-qq", target.bundlePath, "-d", scratch]);
      const botJsonPath = join(scratch, "bot.json");
      const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
      document.bot.authoredAudioVoiceProfile = target.desiredProfile;
      document.exportedAt = revision;
      writeFileSync(botJsonPath, `${JSON.stringify(document, null, 2)}\n`);
      const rebuiltPath = join(scratch, basename(target.bundlePath));
      execFileSync("zip", ["-X", "-q", rebuiltPath, ...target.entryNames], {
        cwd: scratch,
      });
      const stagedPath = `${target.bundlePath}.voice-plus-staged`;
      copyFileSync(rebuiltPath, stagedPath);
      renameSync(stagedPath, target.bundlePath);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  manifest.updatedAt = revision;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  for (const target of targets) {
    const updated = readTarget(target.id);
    if (
      updated.changed ||
      updated.protectedHash !== target.protectedHash ||
      updated.memoriesHash !== target.memoriesHash
    ) {
      throw new Error(`${target.entry.name} did not round-trip safely.`);
    }
  }
}

console.log(
  JSON.stringify(
    {
      mode: shouldApply ? "apply" : "dry-run",
      scanned: targets.length,
      changed: targets.filter(({ changed }) => changed).length,
      excluded: manifest.bots.length - targets.length,
      backupPath,
    },
    null,
    2,
  ),
);
