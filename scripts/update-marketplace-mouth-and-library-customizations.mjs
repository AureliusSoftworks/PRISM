#!/usr/bin/env node
/**
 * Apply the approved Marketplace mouth default (X 0.00 · Y +0.18) across every
 * Marketplace bundle + matching Library rows, then promote Library face/avatar
 * customizations and personal ElevenLabs voice overrides into the repo packs
 * (and the public ElevenLabs voice lock).
 *
 * Usage:
 *   node --experimental-strip-types scripts/update-marketplace-mouth-and-library-customizations.mjs --dry-run --db PATH --user-id ID
 *   node --experimental-strip-types scripts/update-marketplace-mouth-and-library-customizations.mjs --apply \
 *     --db PATH --user-id ID --workspace-backup PATH --db-backup PATH
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
  resolveBotFaceStyle,
  serializeBotAudioVoiceProfileV1,
} from "@localai/shared";

const root = resolve(import.meta.dirname, "..");
const marketplaceRoot = join(root, "apps/web/public/bot-marketplace");
const manifestPath = join(marketplaceRoot, "manifest.json");
const voiceLockPath = join(marketplaceRoot, "elevenlabs-voice-lock.json");
const desktopDbDefault =
  "/Users/jared/Library/Application Support/com.localai.prism-desktop/localai.db";

const TARGET_MOUTH_OFFSET_X = 0;
const TARGET_MOUTH_OFFSET_Y = 0.18;

const faceFieldToResolvedKey = new Map([
  ["faceEyesFont", "eyesFont"],
  ["faceEyeCharacter", "eyeCharacter"],
  ["faceEyeCount", "eyeCount"],
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
  ["faceThinkingFrames", "thinkingFrames"],
]);

const approvedFaceArchiveFields = [
  "avatarDetails",
  ...faceFieldToResolvedKey.keys(),
];
const approvedFaceDatabaseColumns = [
  "avatar_details_json",
  "face_eyes_font",
  "face_eye_character",
  "face_eye_count",
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
  "face_thinking_frames",
];

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function normalizeVoiceName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolveElevenLabsVoiceId(profile) {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  return (
    normalized.elevenLabsVoiceIdOverride ||
    normalized.elevenLabsVoiceId ||
    null
  );
}

const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");
const databaseArgument = flagValue("--db") || desktopDbDefault;
const userIdArgument = flagValue("--user-id");
const workspaceBackupArgument = flagValue("--workspace-backup");
const databaseBackupArgument = flagValue("--db-backup");

if (shouldApply === explicitDryRun) {
  throw new Error("Choose either --dry-run or --apply.");
}
if (shouldApply && (!workspaceBackupArgument || !databaseBackupArgument)) {
  throw new Error(
    "Applying requires --workspace-backup PATH and --db-backup PATH.",
  );
}

function assertDatabaseIntegrity(database, label) {
  const integrity = database.prepare("PRAGMA integrity_check").get();
  if (integrity?.integrity_check !== "ok") {
    throw new Error(`${label} failed SQLite integrity_check.`);
  }
}

function resolveLiveSessionCookie(databasePath) {
  const db = new DatabaseSync(resolve(databasePath), { readOnly: true });
  try {
    const now = new Date().toISOString();
    const session = db
      .prepare(
        "SELECT token FROM sessions WHERE expires_at > ? ORDER BY expires_at DESC LIMIT 1",
      )
      .get(now);
    if (!session?.token) {
      throw new Error(
        "No live PRISM desktop session found. Open the desktop app while signed in, then retry.",
      );
    }
    return `localai_session=${session.token}`;
  } finally {
    db.close();
  }
}

async function fetchElevenLabsCatalog(cookie) {
  const response = await fetch("http://127.0.0.1:19787/api/voices/elevenlabs", {
    headers: { Cookie: cookie, Accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `ElevenLabs catalog request failed (${response.status}): ${text.slice(0, 300)}`,
    );
  }
  const payload = JSON.parse(text);
  const voices = Array.isArray(payload.voices)
    ? payload.voices
    : Array.isArray(payload)
      ? payload
      : [];
  return voices
    .map((voice) => ({
      voiceId: String(voice.voiceId || voice.voice_id || "").trim(),
      name: String(voice.name || "").trim(),
    }))
    .filter((voice) => voice.voiceId && voice.name);
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
    ? sha256(
        execFileSync("unzip", ["-p", bundlePath, "memories.json"]),
      )
    : null;
  return {
    bundlePath,
    entryNames,
    document,
    memoriesSha256,
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
  const faceThinkingFrames = parseStoredBotFaceThinkingFrames(
    row.face_thinking_frames,
  );
  return {
    avatarDetails,
    faceEyesFont: row.face_eyes_font,
    faceEyeCharacter: row.face_eye_character,
    faceEyeCount: row.face_eye_count,
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
    faceThinkingFrames,
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
        // Mouth is forced separately to the approved default.
        resolvedKey !== "mouthOffsetX" &&
        resolvedKey !== "mouthOffsetY" &&
        !jsonEqual(candidateStyle[resolvedKey], sourceStyle[resolvedKey]),
    );
  };
  let workingBot = { ...bot };
  let remainingDiffKeys = styleDiffKeys(workingBot);
  while (remainingDiffKeys.length > 0) {
    let reduced = false;
    for (const archiveField of faceFieldToResolvedKey.keys()) {
      if (archiveField === "faceMouthOffsetX" || archiveField === "faceMouthOffsetY") {
        continue;
      }
      if (fields.includes(archiveField)) continue;
      const candidate = {
        ...workingBot,
        [archiveField]: sourceValues[archiveField],
      };
      const candidateDiffKeys = styleDiffKeys(candidate);
      if (candidateDiffKeys.length < remainingDiffKeys.length) {
        fields.push(archiveField);
        workingBot = candidate;
        remainingDiffKeys = candidateDiffKeys;
        reduced = true;
        break;
      }
    }
    if (!reduced) {
      throw new Error(
        `Could not reconcile saved face fields: ${remainingDiffKeys.join(", ")}.`,
      );
    }
  }
  return fields;
}

function personalVoiceProfile(row) {
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
  const authoredNormalized = normalizeBotAudioVoiceProfileV1(authored);
  const overrideNormalized = override
    ? normalizeBotAudioVoiceProfileV1(override)
    : null;
  const personalId = resolveElevenLabsVoiceId(
    overrideNormalized ?? authoredNormalized,
  );
  return {
    authoredNormalized,
    overrideNormalized,
    personalId,
    fromOverride: Boolean(resolveElevenLabsVoiceId(overrideNormalized)),
  };
}

const cookie = resolveLiveSessionCookie(databaseArgument);
const catalog = await fetchElevenLabsCatalog(cookie);
const catalogById = new Map(catalog.map((voice) => [voice.voiceId, voice]));
const catalogByName = new Map();
for (const voice of catalog) {
  const key = normalizeVoiceName(voice.name);
  if (catalogByName.has(key) && catalogByName.get(key).voiceId !== voice.voiceId) {
    throw new Error(`Ambiguous ElevenLabs library voice name: ${voice.name}`);
  }
  catalogByName.set(key, voice);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const voiceLock = JSON.parse(readFileSync(voiceLockPath, "utf8"));
if (!voiceLock?.bots || typeof voiceLock.bots !== "object") {
  throw new Error("elevenlabs-voice-lock.json is missing a bots map.");
}

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

const nextVoiceLock = structuredClone(voiceLock);
const targets = [];
const missingLibrary = [];

for (const entry of manifest.bots) {
  const bundle = readBundle(entry);
  const bot = bundle.document.bot;
  const marketStyle = resolveBotFaceStyle(bot, null);
  const mouthNeedsUpdate =
    marketStyle.mouthOffsetX !== TARGET_MOUTH_OFFSET_X ||
    marketStyle.mouthOffsetY !== TARGET_MOUTH_OFFSET_Y;

  const rows = db
    .prepare("SELECT * FROM bots WHERE user_id = ? AND export_hash = ?")
    .all(resolvedUserId, entry.botHash);
  if (rows.length > 1) {
    throw new Error(`Found duplicate installed rows for ${entry.name}.`);
  }
  const row = rows[0] ?? null;
  if (!row) {
    missingLibrary.push({ id: entry.id, name: entry.name, branchLock: entry.branchLock ?? null });
  }

  let faceFields = [];
  let sourceFaceValues = null;
  if (row) {
    sourceFaceValues = libraryFaceValues(row, entry.name);
    faceFields = changedFaceArchiveFields(bot, sourceFaceValues);
  }

  let voiceChanged = false;
  let nextAuthored = normalizeBotAudioVoiceProfileV1(bot.authoredAudioVoiceProfile);
  let resolvedVoice = null;
  let personalVoice = null;
  if (row) {
    personalVoice = personalVoiceProfile(row);
    if (personalVoice.personalId) {
      resolvedVoice = catalogById.get(personalVoice.personalId);
      if (!resolvedVoice) {
        throw new Error(
          `${entry.name}: personal ElevenLabs voice ID ${personalVoice.personalId} is not in the live library.`,
        );
      }
      const currentId = resolveElevenLabsVoiceId(nextAuthored);
      if (currentId !== resolvedVoice.voiceId) {
        nextAuthored = normalizeBotAudioVoiceProfileV1({
          ...nextAuthored,
          elevenLabsVoiceIdOverride: resolvedVoice.voiceId,
        });
        voiceChanged = true;
      }
      if (!entry.branchLock) {
        const existingLock = nextVoiceLock.bots[entry.id];
        if (
          !existingLock ||
          existingLock.voiceId !== resolvedVoice.voiceId ||
          existingLock.voiceName !== resolvedVoice.name ||
          existingLock.botName !== entry.name
        ) {
          nextVoiceLock.bots[entry.id] = {
            botName: entry.name,
            voiceName: resolvedVoice.name,
            voiceId: resolvedVoice.voiceId,
          };
        }
      }
    }
  }

  const marketplaceChanged =
    mouthNeedsUpdate || faceFields.length > 0 || voiceChanged;

  let libraryMouthChanged = false;
  let libraryAuthoredVoiceChanged = false;
  let libraryFaceProtectedHash = null;
  let libraryVoiceProtectedHash = null;
  let nextLibraryAuthoredJson = null;
  if (row) {
    libraryMouthChanged =
      Number(row.face_mouth_offset_x) !== TARGET_MOUTH_OFFSET_X ||
      Number(row.face_mouth_offset_y) !== TARGET_MOUTH_OFFSET_Y;
    const currentLibraryAuthored = normalizeBotAudioVoiceProfileV1(
      row.authored_audio_voice_profile
        ? JSON.parse(row.authored_audio_voice_profile)
        : undefined,
    );
    const nextLibraryAuthored = normalizeBotAudioVoiceProfileV1({
      ...currentLibraryAuthored,
      ...(resolvedVoice
        ? { elevenLabsVoiceIdOverride: resolvedVoice.voiceId }
        : {}),
    });
    nextLibraryAuthoredJson = serializeBotAudioVoiceProfileV1(nextLibraryAuthored);
    libraryAuthoredVoiceChanged =
      resolveElevenLabsVoiceId(currentLibraryAuthored) !==
      resolveElevenLabsVoiceId(nextLibraryAuthored);
    libraryFaceProtectedHash = sha256(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(row).filter(
            ([column]) =>
              !approvedFaceDatabaseColumns.includes(column) &&
              column !== "updated_at" &&
              column !== "authored_audio_voice_profile",
          ),
        ),
      ),
    );
    libraryVoiceProtectedHash = sha256(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(row).filter(
            ([column]) =>
              column !== "authored_audio_voice_profile" &&
              column !== "updated_at",
          ),
        ),
      ),
    );
  }

  targets.push({
    entry,
    ...bundle,
    mouthNeedsUpdate,
    faceFields,
    sourceFaceValues,
    voiceChanged,
    nextAuthored,
    resolvedVoice,
    personalVoice,
    marketplaceChanged,
    row,
    libraryMouthChanged,
    libraryAuthoredVoiceChanged,
    libraryFaceProtectedHash,
    libraryVoiceProtectedHash,
    nextLibraryAuthoredJson,
    protectedBotHash: sha256(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(bot).filter(
            ([field]) =>
              !approvedFaceArchiveFields.includes(field) &&
              field !== "authoredAudioVoiceProfile" &&
              field !== "faceMouthOffsetX" &&
              field !== "faceMouthOffsetY",
          ),
        ),
      ),
    ),
  });
}

const voiceLockChanged = !jsonEqual(voiceLock, nextVoiceLock);
const marketplaceTargets = targets.filter((target) => target.marketplaceChanged);
const libraryMouthTargets = targets.filter(
  (target) => target.row && target.libraryMouthChanged,
);
const libraryVoiceTargets = targets.filter(
  (target) => target.row && target.libraryAuthoredVoiceChanged,
);

console.log(
  JSON.stringify(
    {
      mode: shouldApply ? "apply" : "dry-run",
      userId: resolvedUserId,
      totals: {
        marketplaceBots: targets.length,
        marketplaceMouthUpdates: targets.filter((t) => t.mouthNeedsUpdate).length,
        marketplaceFacePromotions: targets.filter((t) => t.faceFields.length > 0)
          .length,
        marketplaceVoicePromotions: targets.filter((t) => t.voiceChanged).length,
        marketplaceBundlesChanging: marketplaceTargets.length,
        voiceLockChanging: voiceLockChanged,
        libraryMouthUpdates: libraryMouthTargets.length,
        libraryAuthoredVoiceUpdates: libraryVoiceTargets.length,
        missingLibrary: missingLibrary.length,
      },
      facePromotions: targets
        .filter((target) => target.faceFields.length > 0)
        .map((target) => ({
          id: target.entry.id,
          name: target.entry.name,
          fields: target.faceFields,
        })),
      voicePromotions: targets
        .filter((target) => target.voiceChanged)
        .map((target) => ({
          id: target.entry.id,
          name: target.entry.name,
          voiceId: target.resolvedVoice?.voiceId ?? null,
          voiceName: target.resolvedVoice?.name ?? null,
          fromOverride: target.personalVoice?.fromOverride ?? false,
        })),
      missingLibrary,
    },
    null,
    2,
  ),
);

if (!shouldApply) {
  db.close();
  process.exit(0);
}

const workspaceBackupPath = resolve(workspaceBackupArgument);
if (existsSync(workspaceBackupPath)) {
  throw new Error(`Refusing to overwrite workspace backup: ${workspaceBackupPath}`);
}
mkdirSync(workspaceBackupPath, { recursive: true });
copyFileSync(manifestPath, join(workspaceBackupPath, "manifest.json"));
copyFileSync(voiceLockPath, join(workspaceBackupPath, "elevenlabs-voice-lock.json"));
for (const target of marketplaceTargets) {
  copyFileSync(
    target.bundlePath,
    join(workspaceBackupPath, basename(target.bundlePath)),
  );
}

const databaseBackupPath = resolve(databaseBackupArgument);
if (databaseBackupPath === resolve(databaseArgument)) {
  throw new Error("The database backup path must differ from the live database.");
}
if (existsSync(databaseBackupPath)) {
  throw new Error(`Refusing to overwrite database backup: ${databaseBackupPath}`);
}
mkdirSync(dirname(databaseBackupPath), { recursive: true });
await backup(db, databaseBackupPath);
const backupDb = new DatabaseSync(databaseBackupPath, { readOnly: true });
try {
  assertDatabaseIntegrity(backupDb, "Backup database");
} finally {
  backupDb.close();
}
assertDatabaseIntegrity(db, "Live database before update");

const marketplaceUpdatedAt = new Date().toISOString();

for (const target of marketplaceTargets) {
  const scratch = mkdtempSync(join(tmpdir(), "prism-marketplace-mouth-custom-"));
  try {
    execFileSync("unzip", ["-qq", target.bundlePath, "-d", scratch]);
    const botJsonPath = join(scratch, "bot.json");
    const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
    for (const field of target.faceFields) {
      document.bot[field] = target.sourceFaceValues[field];
    }
    document.bot.faceMouthOffsetX = TARGET_MOUTH_OFFSET_X;
    document.bot.faceMouthOffsetY = TARGET_MOUTH_OFFSET_Y;
    if (target.voiceChanged) {
      document.bot.authoredAudioVoiceProfile = target.nextAuthored;
    }
    document.exportedAt = marketplaceUpdatedAt;
    writeFileSync(botJsonPath, `${JSON.stringify(document, null, 2)}\n`);
    const rebuiltPath = join(scratch, basename(target.bundlePath));
    execFileSync("zip", ["-X", "-q", rebuiltPath, ...target.entryNames], {
      cwd: scratch,
    });
    const rebuiltDocument = JSON.parse(
      execFileSync("unzip", ["-p", rebuiltPath, "bot.json"], {
        encoding: "utf8",
      }),
    );
    if (rebuiltDocument.botHash !== target.entry.botHash) {
      throw new Error(`${target.entry.name} botHash changed unexpectedly.`);
    }
    const rebuiltStyle = resolveBotFaceStyle(rebuiltDocument.bot, null);
    if (
      rebuiltStyle.mouthOffsetX !== TARGET_MOUTH_OFFSET_X ||
      rebuiltStyle.mouthOffsetY !== TARGET_MOUTH_OFFSET_Y
    ) {
      throw new Error(`${target.entry.name} mouth default did not stick.`);
    }
    if (
      target.memoriesSha256 !== null &&
      sha256(execFileSync("unzip", ["-p", rebuiltPath, "memories.json"])) !==
        target.memoriesSha256
    ) {
      throw new Error(`${target.entry.name} memories changed during update.`);
    }
    renameSync(rebuiltPath, target.bundlePath);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (marketplaceTargets.length > 0) {
  manifest.updatedAt = marketplaceUpdatedAt;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
if (voiceLockChanged) {
  writeFileSync(voiceLockPath, `${JSON.stringify(nextVoiceLock, null, 2)}\n`);
}

db.exec("BEGIN");
try {
  const now = new Date().toISOString();
  for (const target of libraryMouthTargets) {
    db.prepare(
      `UPDATE bots
          SET face_mouth_offset_x = ?, face_mouth_offset_y = ?, updated_at = ?
        WHERE user_id = ? AND export_hash = ?`,
    ).run(
      TARGET_MOUTH_OFFSET_X,
      TARGET_MOUTH_OFFSET_Y,
      now,
      resolvedUserId,
      target.entry.botHash,
    );
  }
  for (const target of libraryVoiceTargets) {
    db.prepare(
      `UPDATE bots
          SET authored_audio_voice_profile = ?, updated_at = ?
        WHERE user_id = ? AND export_hash = ?`,
    ).run(
      target.nextLibraryAuthoredJson,
      now,
      resolvedUserId,
      target.entry.botHash,
    );
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

assertDatabaseIntegrity(db, "Live database after update");

for (const target of [...libraryMouthTargets, ...libraryVoiceTargets]) {
  const row = db
    .prepare("SELECT * FROM bots WHERE user_id = ? AND export_hash = ?")
    .get(resolvedUserId, target.entry.botHash);
  if (!row) {
    throw new Error(`${target.entry.name} disappeared from Library after update.`);
  }
  if (Number(row.face_mouth_offset_x) !== TARGET_MOUTH_OFFSET_X) {
    throw new Error(`${target.entry.name} Library mouth X mismatch after update.`);
  }
  if (Number(row.face_mouth_offset_y) !== TARGET_MOUTH_OFFSET_Y) {
    throw new Error(`${target.entry.name} Library mouth Y mismatch after update.`);
  }
  if (target.libraryAuthoredVoiceChanged) {
    const authored = normalizeBotAudioVoiceProfileV1(
      JSON.parse(row.authored_audio_voice_profile),
    );
    if (resolveElevenLabsVoiceId(authored) !== target.resolvedVoice.voiceId) {
      throw new Error(
        `${target.entry.name} Library authored voice did not stick.`,
      );
    }
    // Personal override must remain authoritative and untouched.
    if (target.row.audio_voice_profile_override !== row.audio_voice_profile_override) {
      throw new Error(
        `${target.entry.name} personal voice override was altered.`,
      );
    }
  }
}

db.close();

console.log(
  JSON.stringify(
    {
      applied: true,
      workspaceBackupPath,
      databaseBackupPath,
      marketplaceUpdatedAt,
      marketplaceBundlesUpdated: marketplaceTargets.length,
      voiceLockUpdated: voiceLockChanged,
      libraryMouthUpdated: libraryMouthTargets.length,
      libraryAuthoredVoiceUpdated: libraryVoiceTargets.length,
    },
    null,
    2,
  ),
);
