#!/usr/bin/env node
/**
 * Default /update-bots sync: Library is the source of truth for Marketplace
 * design — Avatar Details ink, face geometry, loading-spinner frames/size/
 * placement, and Prism + ElevenLabs voice profiles.
 *
 * Usage:
 *   node --experimental-strip-types scripts/promote-library-design-to-marketplace.mjs \
 *     --dry-run --db PATH --user-id ID [--only id[,id...]]
 *   node --experimental-strip-types scripts/promote-library-design-to-marketplace.mjs \
 *     --apply --db PATH --user-id ID --workspace-backup PATH --db-backup PATH [--only id[,id...]]
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

function normalizeVoiceName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
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
const onlyArgument = flagValue("--only");

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

function isPublicMarketplaceEntry(entry, lockedThemeIds) {
  if (entry.branchLock) return false;
  const themeIds = entry.themeIds ?? [];
  if (themeIds.length === 1 && lockedThemeIds.has(themeIds[0])) return false;
  return true;
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
  let workingBot = { ...bot };
  let remainingDiffKeys = styleDiffKeys(workingBot);
  while (remainingDiffKeys.length > 0) {
    let reduced = false;
    for (const archiveField of faceFieldToResolvedKey.keys()) {
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

function portableAvatarSfx(avatarSfx) {
  if (!avatarSfx || typeof avatarSfx !== "object") return undefined;
  const next = { ...avatarSfx };
  // Keep play flags / volume / source metadata, but do not ship multi-MB
  // personal thinking-loop blobs into Marketplace bundles.
  if ("audioDataUrl" in next) delete next.audioDataUrl;
  return next;
}

function publicElevenLabsDirectionOk(value) {
  const parts = String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return (
    parts.length >= 2 &&
    parts.length <= 3 &&
    parts.every((part) => part.length > 0 && part.length <= 48)
  );
}

function resolvePublicElevenLabsDirection(heard, market, authored) {
  if (publicElevenLabsDirectionOk(heard?.elevenLabsDirection)) {
    return heard.elevenLabsDirection;
  }
  if (publicElevenLabsDirectionOk(market?.elevenLabsDirection)) {
    return market.elevenLabsDirection;
  }
  if (publicElevenLabsDirectionOk(authored?.elevenLabsDirection)) {
    return authored.elevenLabsDirection;
  }
  return "natural, conversational";
}

function heardLibraryVoiceProfile(row, marketAuthored, botName) {
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
  const source = override ?? authored;
  const heard = normalizeBotAudioVoiceProfileV1(source);
  const authoredNormalized = normalizeBotAudioVoiceProfileV1(authored);
  const marketNormalized = normalizeBotAudioVoiceProfileV1(marketAuthored);
  const elId = resolveElevenLabsVoiceId(heard);
  const strippedSfx = portableAvatarSfx(heard.avatarSfx);
  // Public Marketplace catalog pins chorus (resonance only for Vader names).
  const catalogEffect = /^(?:darth\s+)?vader$/iu.test(String(botName || ""))
    ? "resonance"
    : "chorus";
  const portable = normalizeBotAudioVoiceProfileV1({
    ...heard,
    elevenLabsVoiceId: null,
    elevenLabsVoiceIdOverride: elId,
    elevenLabsVoiceInitialized: elId
      ? true
      : heard.elevenLabsVoiceInitialized,
    elevenLabsDirection: resolvePublicElevenLabsDirection(
      heard,
      marketNormalized,
      authoredNormalized,
    ),
    elevenLabsEffect: catalogEffect,
    voiceEffectExplicit: true,
    ...(strippedSfx ? { avatarSfx: strippedSfx } : { avatarSfx: undefined }),
  });
  return {
    fromOverride: Boolean(override),
    heard,
    portable,
    elId,
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

const cookie = resolveLiveSessionCookie(databaseArgument);
const catalog = await fetchElevenLabsCatalog(cookie);
const catalogById = new Map(catalog.map((voice) => [voice.voiceId, voice]));

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const voiceLock = JSON.parse(readFileSync(voiceLockPath, "utf8"));
if (!voiceLock?.bots || typeof voiceLock.bots !== "object") {
  throw new Error("elevenlabs-voice-lock.json is missing a bots map.");
}
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

const nextVoiceLock = structuredClone(voiceLock);
const targets = [];
const missingLibrary = [];
const unresolvedVoices = [];

for (const entry of manifest.bots) {
  if (!isPublicMarketplaceEntry(entry, lockedThemeIds)) continue;
  if (onlyIds && !onlyIds.has(entry.id)) continue;

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

  const voiceInfo = heardLibraryVoiceProfile(
    row,
    bot.authoredAudioVoiceProfile,
    entry.name,
  );
  let resolvedVoice = null;
  if (voiceInfo.elId) {
    resolvedVoice = catalogById.get(voiceInfo.elId) ?? null;
    if (!resolvedVoice) {
      unresolvedVoices.push({
        id: entry.id,
        name: entry.name,
        voiceId: voiceInfo.elId,
      });
    }
  }

  const currentAuthored = normalizeBotAudioVoiceProfileV1(
    bot.authoredAudioVoiceProfile,
  );
  const nextAuthored = voiceInfo.portable;
  const voiceChanged = !jsonEqual(currentAuthored, nextAuthored);

  if (resolvedVoice) {
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

  const changedArchiveFields = [...faceFields];
  if (voiceChanged) changedArchiveFields.push("authoredAudioVoiceProfile");

  const currentLibraryAuthored = normalizeBotAudioVoiceProfileV1(
    row.authored_audio_voice_profile
      ? JSON.parse(row.authored_audio_voice_profile)
      : undefined,
  );
  const libraryAuthoredVoiceChanged = !jsonEqual(
    currentLibraryAuthored,
    nextAuthored,
  );

  targets.push({
    entry,
    bundle,
    row,
    sourceFaceValues,
    faceFields,
    spinnerFields,
    voiceChanged,
    voiceInfo,
    resolvedVoice,
    nextAuthored,
    changedArchiveFields,
    marketplaceChanged: changedArchiveFields.length > 0,
    libraryAuthoredVoiceChanged,
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

if (unresolvedVoices.length > 0) {
  throw new Error(
    `Personal ElevenLabs voice ID(s) missing from the live library:\n${unresolvedVoices
      .map((item) => `- ${item.name}: ${item.voiceId}`)
      .join("\n")}`,
  );
}

const voiceLockChanged = !jsonEqual(voiceLock, nextVoiceLock);
const marketplaceTargets = targets.filter((target) => target.marketplaceChanged);
const libraryVoiceTargets = targets.filter(
  (target) => target.libraryAuthoredVoiceChanged,
);

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
        voiceLockChanging: voiceLockChanged,
        libraryAuthoredVoiceUpdates: libraryVoiceTargets.length,
      },
      missingLibrary,
      changes: marketplaceTargets.map((target) => ({
        id: target.entry.id,
        name: target.entry.name,
        faceFields: target.faceFields,
        spinnerFields: target.spinnerFields,
        voiceChanged: target.voiceChanged,
        voiceId: target.resolvedVoice?.voiceId ?? null,
        voiceName: target.resolvedVoice?.name ?? null,
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
if (existsSync(databaseBackupArgument)) {
  throw new Error(
    `Refusing to overwrite database backup: ${databaseBackupArgument}`,
  );
}
if (resolve(databaseBackupArgument) === resolve(databaseArgument)) {
  throw new Error("The database backup must differ from the live database.");
}

const workspaceBackupPath = resolve(workspaceBackupArgument);
const databaseBackupPath = resolve(databaseBackupArgument);
mkdirSync(workspaceBackupPath, { recursive: true });
copyFileSync(manifestPath, join(workspaceBackupPath, "manifest.json"));
copyFileSync(voiceLockPath, join(workspaceBackupPath, "elevenlabs-voice-lock.json"));
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
        voiceId: target.resolvedVoice?.voiceId ?? null,
      })),
    },
    null,
    2,
  )}\n`,
);

mkdirSync(dirname(databaseBackupPath), { recursive: true });
await backup(db, databaseBackupPath);
const backupDb = new DatabaseSync(databaseBackupPath, { readOnly: true });
try {
  assertDatabaseIntegrity(backupDb, "Backup database");
} finally {
  backupDb.close();
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
    if (voiceLockChanged) {
      writeFileSync(
        voiceLockPath,
        `${JSON.stringify(nextVoiceLock, null, 2)}\n`,
      );
    }

    const updateAuthored = db.prepare(
      "UPDATE bots SET authored_audio_voice_profile = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    );
    for (const target of libraryVoiceTargets) {
      updateAuthored.run(
        serializeBotAudioVoiceProfileV1(target.nextAuthored),
        revision,
        target.row.id,
        resolvedUserId,
      );
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
      libraryAuthoredVoiceUpdates: libraryVoiceTargets.length,
      voiceLockChanged,
    },
    null,
    2,
  ),
);
