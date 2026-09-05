#!/usr/bin/env node
/**
 * Remove account-bound ElevenLabs identities from every Marketplace bundle.
 * PRISM/base voice shaping remains intact; users may choose their own
 * ElevenLabs voice after installation.
 *
 * Usage:
 *   node scripts/strip-marketplace-bot-elevenlabs-voices.mjs --dry-run [--only id[,id...]]
 *   node scripts/strip-marketplace-bot-elevenlabs-voices.mjs --apply \
 *     --backup .codex/output/update-bots/backups/TIMESTAMP-no-elevenlabs-defaults \
 *     [--only id[,id...]]
 */

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
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const marketplaceRoot = join(root, "apps/web/public/bot-marketplace");
const manifestPath = join(marketplaceRoot, "manifest.json");
const legacyVoiceLockPath = join(
  marketplaceRoot,
  "elevenlabs-voice-lock.json",
);

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");
const backupArgument = flagValue("--backup");
const onlyArgument = flagValue("--only");

if (shouldApply === explicitDryRun) {
  throw new Error("Choose either --dry-run or --apply.");
}
if (shouldApply && !backupArgument) {
  throw new Error("Applying requires --backup PATH.");
}

const onlyIds = onlyArgument
  ? new Set(
      onlyArgument
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    )
  : null;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stripElevenLabsIdentity(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return profile;
  }
  const next = structuredClone(profile);
  delete next.elevenLabsVoiceId;
  delete next.elevenLabsVoiceIdOverride;
  delete next.elevenLabsVoiceInitialized;
  return next;
}

function readBundle(entry) {
  const bundlePath = join(
    marketplaceRoot,
    entry.bundlePath.replace(/^\/bot-marketplace\//u, ""),
  );
  const entryNames = execFileSync("unzip", ["-Z1", bundlePath], {
    encoding: "utf8",
  })
    .split(/\r?\n/u)
    .filter(Boolean);
  if (!entryNames.includes("bot.json")) {
    throw new Error(`${entry.name} bundle is missing bot.json.`);
  }
  const document = JSON.parse(
    execFileSync("unzip", ["-p", bundlePath, "bot.json"], {
      encoding: "utf8",
    }),
  );
  if (document.botHash !== entry.botHash || document.bot?.name !== entry.name) {
    throw new Error(`${entry.name} bundle identity does not match the manifest.`);
  }
  const memoriesSha256 = entryNames.includes("memories.json")
    ? sha256(execFileSync("unzip", ["-p", bundlePath, "memories.json"]))
    : null;
  const currentAuthored = document.bot?.authoredAudioVoiceProfile;
  const currentOverride = document.bot?.audioVoiceProfileOverride;
  const nextAuthored = stripElevenLabsIdentity(currentAuthored);
  const nextOverride = stripElevenLabsIdentity(currentOverride);
  const authoredChanged =
    JSON.stringify(currentAuthored) !== JSON.stringify(nextAuthored);
  const overrideChanged =
    JSON.stringify(currentOverride) !== JSON.stringify(nextOverride);
  return {
    entry,
    bundlePath,
    entryNames,
    document,
    memoriesSha256,
    nextAuthored,
    nextOverride,
    authoredChanged,
    overrideChanged,
    changed: authoredChanged || overrideChanged,
  };
}

function assertIdentityAbsent(profile, label) {
  if (!profile || typeof profile !== "object") return;
  for (const field of [
    "elevenLabsVoiceId",
    "elevenLabsVoiceIdOverride",
    "elevenLabsVoiceInitialized",
  ]) {
    if (Object.hasOwn(profile, field)) {
      throw new Error(`${label} still contains ${field}.`);
    }
  }
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const manifestById = new Map(manifest.bots.map((entry) => [entry.id, entry]));
if (onlyIds) {
  const unknown = [...onlyIds].filter((id) => !manifestById.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown Marketplace bot id(s): ${unknown.join(", ")}`);
  }
}

const targets = manifest.bots
  .filter((entry) => !onlyIds || onlyIds.has(entry.id))
  .map(readBundle);
const changing = targets.filter((target) => target.changed);

console.log(
  JSON.stringify(
    {
      mode: shouldApply ? "apply" : "dry-run",
      totals: {
        marketplaceBotsChecked: targets.length,
        marketplaceBundlesChanging: changing.length,
        authoredIdentitiesRemoved: changing.filter(
          (target) => target.authoredChanged,
        ).length,
        personalOverrideIdentitiesRemoved: changing.filter(
          (target) => target.overrideChanged,
        ).length,
      },
      changes: changing.map((target) => ({
        id: target.entry.id,
        name: target.entry.name,
        branchLock: target.entry.branchLock ?? null,
        authoredIdentity: target.authoredChanged,
        personalOverrideIdentity: target.overrideChanged,
      })),
    },
    null,
    2,
  ),
);

if (!shouldApply) process.exit(0);

const backupPath = resolve(backupArgument);
if (existsSync(backupPath)) {
  throw new Error(`Refusing to overwrite backup: ${backupPath}`);
}
mkdirSync(backupPath, { recursive: true });
copyFileSync(manifestPath, join(backupPath, "manifest.json"));
if (existsSync(legacyVoiceLockPath)) {
  copyFileSync(
    legacyVoiceLockPath,
    join(backupPath, "elevenlabs-voice-lock.json"),
  );
}
for (const target of changing) {
  copyFileSync(
    target.bundlePath,
    join(backupPath, basename(target.bundlePath)),
  );
}

const revision = new Date().toISOString();
const stage = mkdtempSync(join(tmpdir(), "prism-no-elevenlabs-defaults-"));
try {
  for (const target of changing) {
    const scratch = mkdtempSync(join(stage, `${target.entry.id}-`));
    execFileSync("unzip", ["-qq", target.bundlePath, "-d", scratch]);
    const botJsonPath = join(scratch, "bot.json");
    const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
    document.bot.authoredAudioVoiceProfile = target.nextAuthored;
    if (target.nextOverride === undefined) {
      delete document.bot.audioVoiceProfileOverride;
    } else {
      document.bot.audioVoiceProfileOverride = target.nextOverride;
    }
    document.exportedAt = revision;
    writeFileSync(botJsonPath, `${JSON.stringify(document, null, 2)}\n`);

    const rebuiltPath = join(stage, basename(target.bundlePath));
    execFileSync("zip", ["-X", "-q", rebuiltPath, ...target.entryNames], {
      cwd: scratch,
    });
    const rebuilt = JSON.parse(
      execFileSync("unzip", ["-p", rebuiltPath, "bot.json"], {
        encoding: "utf8",
      }),
    );
    if (
      rebuilt.botHash !== target.entry.botHash ||
      rebuilt.bot?.name !== target.entry.name
    ) {
      throw new Error(`${target.entry.name} identity changed during rebuild.`);
    }
    assertIdentityAbsent(
      rebuilt.bot?.authoredAudioVoiceProfile,
      `${target.entry.name} authored voice`,
    );
    assertIdentityAbsent(
      rebuilt.bot?.audioVoiceProfileOverride,
      `${target.entry.name} personal override`,
    );
    if (
      target.memoriesSha256 !== null &&
      sha256(execFileSync("unzip", ["-p", rebuiltPath, "memories.json"])) !==
        target.memoriesSha256
    ) {
      throw new Error(`${target.entry.name} memories changed during rebuild.`);
    }
    renameSync(rebuiltPath, target.bundlePath);
  }
} finally {
  rmSync(stage, { recursive: true, force: true });
}

if (changing.length > 0) {
  manifest.updatedAt = revision;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(
  JSON.stringify(
    {
      applied: true,
      backupPath,
      marketplaceBundlesUpdated: changing.length,
      marketplaceUpdatedAt: changing.length > 0 ? revision : null,
    },
    null,
    2,
  ),
);
