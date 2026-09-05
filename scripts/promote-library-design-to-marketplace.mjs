#!/usr/bin/env node
/**
 * Default /update-bots sync: Library is the source of truth for Marketplace
 * design — Avatar Details ink, face geometry, loading-spinner frames/size/
 * placement, and portable PRISM/base voice profiles. Marketplace bundles
 * never inherit account-bound ElevenLabs voice identities.
 *
 * Usage:
 *   node --experimental-strip-types scripts/promote-library-design-to-marketplace.mjs \
 *     --dry-run --db PATH --user-id ID [--only id[,id...]]
 *   node --experimental-strip-types scripts/promote-library-design-to-marketplace.mjs \
 *     --apply --db PATH --user-id ID --workspace-backup PATH [--db-backup PATH] [--only id[,id...]]
 *
 * --db-backup is optional. This updater only writes Marketplace archives, so a
 * full live-database copy is not required. Pass it only when you explicitly
 * want a snapshot of the whole Prism save file.
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
import { basename, dirname, join, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import {
  normalizeBotAudioVoiceProfileV1,
  parseStoredBotFaceThinkingFrames,
  resolveBotAudioVoiceProfileV1,
  resolveBotFaceStyle,
} from "@localai/shared";

const root = resolve(import.meta.dirname, "..");
const marketplaceRoot = join(root, "apps/web/public/bot-marketplace");
const manifestPath = join(marketplaceRoot, "manifest.json");
const desktopDbDefault =
  "/Users/jared/Library/Application Support/com.localai.prism-desktop/localai.db";

const faceFieldToResolvedKey = new Map([
  ["faceEyesFont", "eyesFont"],
  ["faceEyeCharacter", "eyeCharacter"],
  ["faceEyeCount", "eyeCount"],
  ["faceEyeSpacing", "eyeSpacing"],
  ["faceEyeAnimation", "eyeAnimation"],
  ["faceMouthFont", "mouthFont"],
  ["faceMouthCharacter", "mouthCharacter"],
  ["faceMouthAnimation", "mouthAnimation"],
  ["faceMouthCoffeePucker", "mouthCoffeePucker"],
  ["faceFontWeight", "weight"],
  ["faceEyeScale", "eyeScale"],
  ["faceEyeOffsetX", "eyeOffsetX"],
  ["faceEyeOffsetY", "eyeOffsetY"],
  ["faceEyeRotationDeg", "eyeRotationDeg"],
  ["faceMouthScale", "mouthScale"],
  ["faceMouthOffsetX", "mouthOffsetX"],
  ["faceMouthOffsetY", "mouthOffsetY"],
  ["faceMouthRotationDeg", "mouthRotationDeg"],
  ["faceBlinkBar", "blinkBar"],
  ["faceBlinkScale", "blinkScale"],
  ["faceBlinkOffsetX", "blinkOffsetX"],
  ["faceBlinkOffsetY", "blinkOffsetY"],
  ["faceBlinkRotationDeg", "blinkRotationDeg"],
  ["faceThinkingFrames", "thinkingFrames"],
  ["faceThinkingScale", "thinkingScale"],
  ["faceThinkingOffsetX", "thinkingOffsetX"],
  ["faceThinkingOffsetY", "thinkingOffsetY"],
]);

const approvedArchiveFields = [
  "avatarDetails",
  "authoredAudioVoiceProfile",
  ...faceFieldToResolvedKey.keys(),
];

const approvedLibraryFaceColumns = [
  "avatar_details_json",
  "face_eyes_font",
  "face_eye_character",
  "face_eye_count",
  "face_eye_spacing",
  "face_eye_animation",
  "face_mouth_font",
  "face_mouth_character",
  "face_mouth_animation",
  "face_mouth_coffee_pucker",
  "face_font_weight",
  "face_eye_scale",
  "face_eye_offset_x",
  "face_eye_offset_y",
  "face_eye_rotation_deg",
  "face_mouth_scale",
  "face_mouth_offset_x",
  "face_mouth_offset_y",
  "face_mouth_rotation_deg",
  "face_blink_bar",
  "face_blink_scale",
  "face_blink_offset_x",
  "face_blink_offset_y",
  "face_blink_rotation_deg",
  "face_thinking_frames",
  "face_thinking_scale",
  "face_thinking_offset_x",
  "face_thinking_offset_y",
];

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");
const databaseArgument = flagValue("--db") || desktopDbDefault;
const userIdArgument = flagValue("--user-id");
const workspaceBackupArgument = flagValue("--workspace-backup");
const databaseBackupArgument = flagValue("--db-backup");
const onlyArgument = flagValue("--only");

if (shouldApply === explicitDryRun) {
  throw new Error("Choose either --dry-run or --apply.");
}
if (shouldApply && !workspaceBackupArgument) {
  throw new Error("Applying requires --workspace-backup PATH.");
}

function assertDatabaseIntegrity(database, label) {
  const integrity = database.prepare("PRAGMA integrity_check").get();
  if (integrity?.integrity_check !== "ok") {
    throw new Error(`${label} failed SQLite integrity_check.`);
  }
}

function isPublicMarketplaceEntry(entry, lockedThemeIds) {
  if (entry.branchLock) return false;
  const themeIds = entry.themeIds ?? [];
  if (themeIds.length === 1 && lockedThemeIds.has(themeIds[0])) return false;
  return true;
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
    throw new Error(`${entry.name} archive is missing bot.json.`);
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
  return {
    bundlePath,
    entryNames,
    document,
    memoriesSha256,
    archiveSha256: sha256(readFileSync(bundlePath)),
  };
}

function libraryFaceValues(row, label) {
  let avatarDetails = null;
  if (row.avatar_details_json) {
    try {
      avatarDetails = JSON.parse(row.avatar_details_json);
    } catch {
      throw new Error(`${label} has invalid saved Avatar Details Ink.`);
    }
  }
  return {
    avatarDetails,
    faceEyesFont: row.face_eyes_font,
    faceEyeCharacter: row.face_eye_character,
    faceEyeCount: row.face_eye_count,
    faceEyeSpacing: row.face_eye_spacing,
    faceEyeAnimation: row.face_eye_animation,
    faceMouthFont: row.face_mouth_font,
    faceMouthCharacter: row.face_mouth_character,
    faceMouthAnimation: row.face_mouth_animation,
    faceMouthCoffeePucker: row.face_mouth_coffee_pucker === 1,
    faceFontWeight: row.face_font_weight,
    faceEyeScale: row.face_eye_scale,
    faceEyeOffsetX: row.face_eye_offset_x,
    faceEyeOffsetY: row.face_eye_offset_y,
    faceEyeRotationDeg: row.face_eye_rotation_deg,
    faceMouthScale: row.face_mouth_scale,
    faceMouthOffsetX: row.face_mouth_offset_x,
    faceMouthOffsetY: row.face_mouth_offset_y,
    faceMouthRotationDeg: row.face_mouth_rotation_deg,
    faceBlinkBar: row.face_blink_bar,
    faceBlinkScale: row.face_blink_scale,
    faceBlinkOffsetX: row.face_blink_offset_x,
    faceBlinkOffsetY: row.face_blink_offset_y,
    faceBlinkRotationDeg: row.face_blink_rotation_deg,
    faceThinkingFrames: parseStoredBotFaceThinkingFrames(
      row.face_thinking_frames,
    ),
    faceThinkingScale: row.face_thinking_scale,
    faceThinkingOffsetX: row.face_thinking_offset_x,
    faceThinkingOffsetY: row.face_thinking_offset_y,
  };
}

function changedFaceArchiveFields(bot, sourceValues) {
  const fields = [];
  if (!jsonEqual(bot.avatarDetails ?? null, sourceValues.avatarDetails)) {
    fields.push("avatarDetails");
  }
  const sourceStyle = resolveBotFaceStyle(sourceValues, null);
  const styleDiffKeys = (candidate) => {
    const candidateStyle = resolveBotFaceStyle(candidate, null);
    return [...faceFieldToResolvedKey.values()].filter(
      (resolvedKey) =>
        !jsonEqual(candidateStyle[resolvedKey], sourceStyle[resolvedKey]),
    );
  };
  // Apply the complete Library face first, then remove fields that are proven
  // unnecessary. Face and blink geometry can be interdependent: a greedy
  // "only accept an immediate reduction" pass gets stuck when two fields must
  // change together (for example, independent blink offsets plus eye motion).
  let workingBot = {
    ...bot,
    ...Object.fromEntries(
      [...faceFieldToResolvedKey.keys()].map((archiveField) => [
        archiveField,
        sourceValues[archiveField],
      ]),
    ),
  };
  const unresolvedKeys = styleDiffKeys(workingBot);
  if (unresolvedKeys.length > 0) {
    throw new Error(
      `Could not reconcile saved face fields: ${unresolvedKeys.join(", ")}.`,
    );
  }
  for (const archiveField of faceFieldToResolvedKey.keys()) {
    const candidate = {
      ...workingBot,
      [archiveField]: bot[archiveField],
    };
    if (styleDiffKeys(candidate).length === 0) {
      workingBot = candidate;
    } else {
      fields.push(archiveField);
    }
  }
  return fields;
}

function portableAvatarSfx(avatarSfx) {
  if (!avatarSfx || typeof avatarSfx !== "object") return undefined;
  const next = { ...avatarSfx };
  // Keep play flags / volume / source metadata, but do not ship multi-MB
  // personal thinking-loop blobs into Marketplace bundles.
  if ("audioDataUrl" in next) delete next.audioDataUrl;
  return next;
}

function parseLibraryVoiceLayers(row) {
  let authored = null;
  let override = null;
  try {
    authored = row.authored_audio_voice_profile
      ? JSON.parse(row.authored_audio_voice_profile)
      : null;
  } catch {
    authored = null;
  }
  try {
    override = row.audio_voice_profile_override
      ? JSON.parse(row.audio_voice_profile_override)
      : null;
  } catch {
    override = null;
  }
  return { authored, override };
}

function voiceCharacterIsBlank(profile) {
  return [profile.openness, profile.weight, profile.brightness, profile.resonance].every(
    (value) => !value,
  );
}

function rawExpressesVoiceCharacter(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  if (raw.v === 3 && raw.local && typeof raw.local === "object") {
    const tone = raw.local.tone;
    if (!tone || typeof tone !== "object") return false;
    return ["openness", "weight", "brightness", "resonance"].some(
      (key) => key in tone && Number(tone[key]) !== 0,
    );
  }
  return ["openness", "weight", "brightness", "resonance"].some(
    (key) => key in raw && Number(raw[key]) !== 0,
  );
}

/** Prefer Library shaping only when it expresses a non-default choice. */
function pickExpressedShaping(libraryValue, marketValue, blankValue = 0) {
  if (libraryValue == null || libraryValue === blankValue) return marketValue;
  return libraryValue;
}

function marketplaceVoiceProfile(row, marketAuthored) {
  const { authored, override } = parseLibraryVoiceLayers(row);
  const authoredNorm = normalizeBotAudioVoiceProfileV1(authored);
  // Resolve the effective Library voice Jared hears (authored + override), not
  // the override alone — Premium-only overrides often default local fields to
  // inherit/zeros and would otherwise wipe Marketplace Voice+ craftsmanship.
  const heard = resolveBotAudioVoiceProfileV1(authored, override);
  const marketNormalized = normalizeBotAudioVoiceProfileV1(marketAuthored);
  const strippedSfx = portableAvatarSfx(heard.avatarSfx);

  const keepMarketEngine =
    heard.localEnginePreference === "inherit" &&
    marketNormalized.localEnginePreference !== "inherit";
  // Only adopt Library Voice Character when authored/override JSON actually
  // sets those fields. Normalized profiles can mirror eqTilt into brightness
  // and falsely look "crafted."
  const libraryExpressesVoiceCharacter =
    rawExpressesVoiceCharacter(override) || rawExpressesVoiceCharacter(authored);
  const keepMarketVoiceCharacter =
    !libraryExpressesVoiceCharacter ||
    (voiceCharacterIsBlank(heard) && !voiceCharacterIsBlank(marketNormalized));
  // Prefer the Library-authored PRISM archetype for Marketplace shipping.
  // Personal override archetypes often drift under Premium listening and break
  // the curated gender/voice map without reflecting intentional base-voice work.
  const baseVoiceId = authoredNorm.baseVoiceId || heard.baseVoiceId;
  // Public Marketplace bundles must ship Voice+ (catalog quality gate). Never
  // promote a Premium-era "inherit" engine into the authored Marketplace profile.
  const localEnginePreference = keepMarketEngine
    ? marketNormalized.localEnginePreference
    : heard.localEnginePreference === "inherit"
      ? marketNormalized.localEnginePreference !== "inherit"
        ? marketNormalized.localEnginePreference
        : "voice-plus"
      : heard.localEnginePreference;

  // Start from Marketplace so Voice+/portable delivery stays intact, then layer
  // expressed Library portable shaping. Account-bound ElevenLabs identities
  // never cross. Blank Library defaults do not erase Marketplace craftsmanship.
  const portable = normalizeBotAudioVoiceProfileV1({
    ...marketNormalized,
    baseVoiceId,
    systemVoiceName: heard.systemVoiceName ?? marketNormalized.systemVoiceName,
    pitch: pickExpressedShaping(heard.pitch, marketNormalized.pitch),
    warmth: pickExpressedShaping(heard.warmth, marketNormalized.warmth),
    pace: pickExpressedShaping(heard.pace, marketNormalized.pace),
    lilt: pickExpressedShaping(heard.lilt, marketNormalized.lilt),
    bottishTone: pickExpressedShaping(
      heard.bottishTone,
      marketNormalized.bottishTone,
      0.45,
    ),
    eqTilt: pickExpressedShaping(heard.eqTilt, marketNormalized.eqTilt),
    gainDb: pickExpressedShaping(heard.gainDb, marketNormalized.gainDb),
    volume: pickExpressedShaping(heard.volume, marketNormalized.volume, 1),
    texture:
      heard.texture?.preset && heard.texture.preset !== "clean"
        ? heard.texture
        : marketNormalized.texture,
    localEnginePreference,
    localVoiceSource:
      heard.localVoiceSource === "inherit" || !heard.localVoiceSource
        ? marketNormalized.localVoiceSource || "portable"
        : heard.localVoiceSource,
    openness: keepMarketVoiceCharacter ? marketNormalized.openness : heard.openness,
    weight: keepMarketVoiceCharacter ? marketNormalized.weight : heard.weight,
    brightness: keepMarketVoiceCharacter
      ? marketNormalized.brightness
      : heard.brightness,
    resonance: keepMarketVoiceCharacter
      ? marketNormalized.resonance
      : heard.resonance,
    // Keep Marketplace portable speechprint policy (catalog quality gate).
    accentMode: marketNormalized.accentMode,
    speechprintInfluence: marketNormalized.speechprintInfluence,
    elevenLabsVoiceId: null,
    elevenLabsVoiceIdOverride: null,
    elevenLabsVoiceInitialized: false,
    elevenLabsDirection: marketNormalized.elevenLabsDirection,
    elevenLabsEffect: marketNormalized.elevenLabsEffect,
    voiceEffectExplicit: marketNormalized.voiceEffectExplicit,
    elevenLabsStability: marketNormalized.elevenLabsStability,
    ...(strippedSfx ? { avatarSfx: strippedSfx } : {}),
  });
  return {
    fromOverride: Boolean(override),
    heard,
    portable,
  };
}

function protectedBotHash(bot) {
  return sha256(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(bot).filter(
          ([field]) => !approvedArchiveFields.includes(field),
        ),
      ),
    ),
  );
}

function rebuildArchive(target, outputPath, revision) {
  const scratch = mkdtempSync(join(tmpdir(), "prism-library-design-stage-"));
  try {
    execFileSync("unzip", ["-qq", target.bundle.bundlePath, "-d", scratch]);
    const botJsonPath = join(scratch, "bot.json");
    const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
    for (const field of target.changedArchiveFields) {
      if (field === "authoredAudioVoiceProfile") {
        document.bot.authoredAudioVoiceProfile = target.nextAuthored;
        continue;
      }
      document.bot[field] = target.sourceFaceValues[field];
    }
    document.exportedAt = revision;
    writeFileSync(botJsonPath, `${JSON.stringify(document, null, 2)}\n`);
    execFileSync("zip", ["-X", "-q", outputPath, ...target.bundle.entryNames], {
      cwd: scratch,
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const onlyIds = onlyArgument
  ? new Set(
      onlyArgument
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    )
  : null;

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const lockedThemeIds = new Set(
  (manifest.themes ?? [])
    .filter((theme) => theme.branchLock)
    .map((theme) => theme.id),
);

const db = new DatabaseSync(resolve(databaseArgument), {
  readOnly: !shouldApply,
});
const users = db.prepare("SELECT id FROM users ORDER BY created_at ASC").all();
let resolvedUserId = userIdArgument;
if (!resolvedUserId) {
  if (users.length !== 1) {
    throw new Error(
      `Library contains ${users.length} users; provide --user-id explicitly.`,
    );
  }
  resolvedUserId = users[0].id;
}
if (!users.some((user) => user.id === resolvedUserId)) {
  throw new Error("The requested Library user does not exist in this database.");
}

const targets = [];
const missingLibrary = [];

const manifestById = new Map(manifest.bots.map((entry) => [entry.id, entry]));
if (onlyIds) {
  const unknownOnly = [...onlyIds].filter((id) => !manifestById.has(id));
  if (unknownOnly.length > 0) {
    throw new Error(
      `Unknown Marketplace bot id(s) for --only: ${unknownOnly.join(", ")}`,
    );
  }
}

for (const entry of manifest.bots) {
  const isPublic = isPublicMarketplaceEntry(entry, lockedThemeIds);
  // Bare runs sync public shelves only. Explicit --only may also target
  // branch-locked personal backups (e.g. library-dev-backup / Marie Antoinette).
  if (onlyIds) {
    if (!onlyIds.has(entry.id)) continue;
  } else if (!isPublic) {
    continue;
  }

  const bundle = readBundle(entry);
  const bot = bundle.document.bot;
  const rows = db
    .prepare("SELECT * FROM bots WHERE user_id = ? AND export_hash = ?")
    .all(resolvedUserId, entry.botHash);
  if (rows.length > 1) {
    throw new Error(`Found duplicate installed rows for ${entry.name}.`);
  }
  const row = rows[0] ?? null;
  if (!row) {
    missingLibrary.push({ id: entry.id, name: entry.name });
    continue;
  }

  const sourceFaceValues = libraryFaceValues(row, entry.name);
  const faceFields = changedFaceArchiveFields(bot, sourceFaceValues);
  const spinnerFields = faceFields.filter((field) =>
    field.startsWith("faceThinking"),
  );

  const voiceInfo = marketplaceVoiceProfile(
    row,
    bot.authoredAudioVoiceProfile,
  );

  const currentAuthored = normalizeBotAudioVoiceProfileV1(
    bot.authoredAudioVoiceProfile,
  );
  const nextAuthored = voiceInfo.portable;
  const voiceChanged = !jsonEqual(currentAuthored, nextAuthored);

  const changedArchiveFields = [...faceFields];
  if (voiceChanged) changedArchiveFields.push("authoredAudioVoiceProfile");

  targets.push({
    entry,
    isPublic,
    bundle,
    row,
    sourceFaceValues,
    faceFields,
    spinnerFields,
    voiceChanged,
    voiceInfo,
    nextAuthored,
    changedArchiveFields,
    marketplaceChanged: changedArchiveFields.length > 0,
    protectedBotHash: protectedBotHash(bot),
    protectedLibraryHash: sha256(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(row).filter(
            ([column]) =>
              column !== "authored_audio_voice_profile" &&
              column !== "updated_at",
          ),
        ),
      ),
    ),
    faceProtectedLibraryHash: sha256(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(row).filter(
            ([column]) =>
              !approvedLibraryFaceColumns.includes(column) &&
              column !== "updated_at" &&
              column !== "authored_audio_voice_profile",
          ),
        ),
      ),
    ),
  });
}
const marketplaceTargets = targets.filter((target) => target.marketplaceChanged);

console.log(
  JSON.stringify(
    {
      mode: shouldApply ? "apply" : "dry-run",
      userId: resolvedUserId,
      totals: {
        matchedLibrary: targets.length,
        missingLibrary: missingLibrary.length,
        marketplaceBundlesChanging: marketplaceTargets.length,
        artOrSpinnerPromotions: targets.filter((t) => t.faceFields.length > 0)
          .length,
        spinnerPromotions: targets.filter((t) => t.spinnerFields.length > 0)
          .length,
        voicePromotions: targets.filter((t) => t.voiceChanged).length,
        libraryAuthoredVoiceUpdates: 0,
      },
      missingLibrary,
      changes: marketplaceTargets.map((target) => ({
        id: target.entry.id,
        name: target.entry.name,
        branchLock: target.entry.branchLock ?? null,
        faceFields: target.faceFields,
        spinnerFields: target.spinnerFields,
        voiceChanged: target.voiceChanged,
        fromOverride: target.voiceInfo.fromOverride,
      })),
    },
    null,
    2,
  ),
);

if (!shouldApply) {
  db.close();
  process.exit(0);
}

if (existsSync(workspaceBackupArgument)) {
  throw new Error(
    `Refusing to overwrite workspace backup: ${workspaceBackupArgument}`,
  );
}
if (databaseBackupArgument && existsSync(databaseBackupArgument)) {
  throw new Error(
    `Refusing to overwrite database backup: ${databaseBackupArgument}`,
  );
}
if (
  databaseBackupArgument &&
  resolve(databaseBackupArgument) === resolve(databaseArgument)
) {
  throw new Error("The database backup must differ from the live database.");
}

const workspaceBackupPath = resolve(workspaceBackupArgument);
const databaseBackupPath = databaseBackupArgument
  ? resolve(databaseBackupArgument)
  : null;
mkdirSync(workspaceBackupPath, { recursive: true });
copyFileSync(manifestPath, join(workspaceBackupPath, "manifest.json"));
for (const target of marketplaceTargets) {
  copyFileSync(
    target.bundle.bundlePath,
    join(workspaceBackupPath, basename(target.bundle.bundlePath)),
  );
}
writeFileSync(
  join(workspaceBackupPath, "audit.json"),
  `${JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      sourceDatabase: resolve(databaseArgument),
      userId: resolvedUserId,
      changed: marketplaceTargets.map((target) => ({
        id: target.entry.id,
        name: target.entry.name,
        fields: target.changedArchiveFields,
      })),
    },
    null,
    2,
  )}\n`,
);

if (databaseBackupPath) {
  mkdirSync(dirname(databaseBackupPath), { recursive: true });
  await backup(db, databaseBackupPath);
  const backupDb = new DatabaseSync(databaseBackupPath, { readOnly: true });
  try {
    assertDatabaseIntegrity(backupDb, "Backup database");
  } finally {
    backupDb.close();
  }
}

const revision = new Date().toISOString();
const stagedDirectory = mkdtempSync(
  join(tmpdir(), "prism-library-design-promotion-"),
);
try {
  for (const target of marketplaceTargets) {
    rebuildArchive(
      target,
      join(stagedDirectory, basename(target.bundle.bundlePath)),
      revision,
    );
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const target of targets) {
      const current = db
        .prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?")
        .get(target.row.id, resolvedUserId);
      if (!current) {
        throw new Error(`Installed ${target.entry.name} disappeared.`);
      }
      if (
        sha256(
          JSON.stringify(
            Object.fromEntries(
              Object.entries(current).filter(
                ([column]) =>
                  column !== "authored_audio_voice_profile" &&
                  column !== "updated_at",
              ),
            ),
          ),
        ) !== target.protectedLibraryHash
      ) {
        throw new Error(
          `${target.entry.name} protected Library state changed after the dry run.`,
        );
      }
    }

    for (const target of marketplaceTargets) {
      renameSync(
        join(stagedDirectory, basename(target.bundle.bundlePath)),
        target.bundle.bundlePath,
      );
    }
    if (marketplaceTargets.length > 0) {
      manifest.updatedAt = revision;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    for (const target of marketplaceTargets) {
      const rebuilt = readBundle(target.entry);
      if (protectedBotHash(rebuilt.document.bot) !== target.protectedBotHash) {
        throw new Error(
          `${target.entry.name} protected portable fields changed during apply.`,
        );
      }
      if (
        rebuilt.memoriesSha256 !== target.bundle.memoriesSha256 ||
        !jsonEqual(rebuilt.entryNames, target.bundle.entryNames)
      ) {
        throw new Error(`${target.entry.name} archive entries changed.`);
      }
      const remainingFace = changedFaceArchiveFields(
        rebuilt.document.bot,
        target.sourceFaceValues,
      );
      if (remainingFace.length > 0) {
        throw new Error(
          `${target.entry.name} still differs from Library face/ink: ${remainingFace.join(", ")}.`,
        );
      }
      if (
        target.voiceChanged &&
        !jsonEqual(
          normalizeBotAudioVoiceProfileV1(
            rebuilt.document.bot.authoredAudioVoiceProfile,
          ),
          target.nextAuthored,
        )
      ) {
        throw new Error(`${target.entry.name} authored voice did not apply.`);
      }
    }

    assertDatabaseIntegrity(db, "Live database");
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  }
} finally {
  rmSync(stagedDirectory, { recursive: true, force: true });
  db.close();
}

console.log(
  JSON.stringify(
    {
      mode: "apply-complete",
      workspaceBackupPath,
      databaseBackupPath,
      marketplaceBundlesChanged: marketplaceTargets.length,
      libraryAuthoredVoiceUpdates: 0,
    },
    null,
    2,
  ),
);
