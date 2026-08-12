#!/usr/bin/env node

/**
 * Publish Library bots that are missing from the public Marketplace into a
 * private "Library Dev Backup" shelf locked to the `dev` branch.
 *
 * Usage:
 *   node --experimental-strip-types scripts/publish-library-dev-backup-marketplace.mjs \
 *     --db "/path/to/localai.db" --user-id ID --dry-run
 *   node --experimental-strip-types scripts/publish-library-dev-backup-marketplace.mjs \
 *     --db "/path/to/localai.db" --user-id ID --apply \
 *     --backup .codex/output/update-bots/backups/TIMESTAMP-library-dev-backup
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  normalizeBotAudioVoiceProfileV1,
  normalizeBotNamePronunciation,
  normalizeBotPowersV1,
  normalizeBotSelfReferral,
  normalizeOptionalBotAudioVoiceProfileV1,
  parseBotAvatarDetailsV1,
  parseStoredBotFaceThinkingFrames,
  parseStoredBotPrompt,
  resolveBotFaceStyle,
  stripBotProfileMetaSuffix,
} from "@localai/shared";
import {
  createPrismBotArchive,
  parsePrismBotArchive,
} from "../apps/web/src/app/botArchive.ts";

const ROOT = resolve(import.meta.dirname, "..");
const MARKETPLACE_ROOT = join(ROOT, "apps/web/public/bot-marketplace");
const MANIFEST_PATH = join(MARKETPLACE_ROOT, "manifest.json");
const THEME_ID = "library-dev-backup";
const BRANCH_LOCK = "dev";
const COLLECTION_REVISION = new Date().toISOString();
const COLLECTION_VERSION = 18;

const THEME = {
  id: THEME_ID,
  name: "Library Dev Backup",
  description:
    "Personal backup shelf for Library bots that are not on the public Marketplace. Visible only on the dev branch.",
  branchLock: BRANCH_LOCK,
};

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const databaseArgument = flagValue("--db");
const userId = flagValue("--user-id");
const backupArgument = flagValue("--backup");
const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");

if (!databaseArgument || !userId || shouldApply === explicitDryRun) {
  throw new Error(
    "Usage: publish-library-dev-backup-marketplace.mjs --db /absolute/path/localai.db --user-id ID (--dry-run | --apply --backup /new/directory)",
  );
}
if (shouldApply && !backupArgument) {
  throw new Error("Applying requires an explicit --backup directory.");
}

function marketplaceIdFromName(name) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 72);
  return slug || "unnamed-bot";
}

function uniqueMarketplaceId(name, takenIds) {
  const base = marketplaceIdFromName(name);
  if (!takenIds.has(base)) return base;
  let suffix = 2;
  while (takenIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseJsonColumn(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stripElevenLabsIdentity(profile) {
  if (!profile) return profile;
  const next = structuredClone(profile);
  delete next.elevenLabsVoiceId;
  delete next.elevenLabsVoiceIdOverride;
  delete next.elevenLabsVoiceInitialized;
  return next;
}

function resolveAvatarDetails(row) {
  const raw = parseJsonColumn(row.avatar_details_json);
  if (!raw) return null;
  try {
    return parseBotAvatarDetailsV1(raw);
  } catch {
    return null;
  }
}

function subtitleFor(profile, name) {
  const purpose = profile?.purpose?.summary?.trim() || profile?.purpose?.legacyNotes?.trim();
  if (purpose) {
    const firstSentence = purpose.split(/(?<=[.!?])\s+/u)[0]?.trim() ?? purpose;
    return firstSentence.slice(0, 120);
  }
  return `${name} — personal Library backup`;
}

function descriptionFor(profile, name) {
  const purpose =
    profile?.purpose?.summary?.trim() ||
    profile?.purpose?.legacyNotes?.trim() ||
    "";
  if (purpose) return purpose.slice(0, 400);
  return `Private Library backup of ${name}. Not part of the public Marketplace shelves.`;
}

function buildCandidate(row, marketplaceId) {
  const name = String(row.name ?? "").trim();
  const botHash = String(row.export_hash ?? "").trim().toLowerCase();
  if (!name || !/^[a-f0-9]{32}$/u.test(botHash)) {
    throw new Error(`Library bot is missing a portable identity: ${name || row.id}`);
  }
  const profile = parseStoredBotPrompt(row.system_prompt).fields;
  const faceStyle = resolveBotFaceStyle(
    {
      faceEyesFont: row.face_eyes_font,
      faceEyeCharacter: row.face_eye_character,
      faceEyeAnimation: row.face_eye_animation,
      faceMouthFont: row.face_mouth_font,
      faceMouthCharacter: row.face_mouth_character,
      faceMouthAnimation: row.face_mouth_animation,
      faceMouthCoffeePucker: row.face_mouth_coffee_pucker,
      faceFontWeight: row.face_font_weight,
      faceEyeScale: row.face_eye_scale,
      faceEyeOffsetX: row.face_eye_offset_x,
      faceEyeOffsetY: row.face_eye_offset_y,
      faceEyeRotationDeg: row.face_eye_rotation_deg,
      faceEyeCount: row.face_eye_count,
      faceEyeSpacing: row.face_eye_spacing,
      faceMouthScale: row.face_mouth_scale,
      faceMouthOffsetX: row.face_mouth_offset_x,
      faceMouthOffsetY: row.face_mouth_offset_y,
      faceMouthRotationDeg: row.face_mouth_rotation_deg,
      faceBlinkBar: row.face_blink_bar,
      faceBlinkScale: row.face_blink_scale,
      faceBlinkOffsetX: row.face_blink_offset_x,
      faceBlinkOffsetY: row.face_blink_offset_y,
      faceBlinkRotationDeg: row.face_blink_rotation_deg,
      faceThinkingFrames: parseStoredBotFaceThinkingFrames(row.face_thinking_frames),
      faceThinkingScale: row.face_thinking_scale,
      faceThinkingOffsetX: row.face_thinking_offset_x,
      faceThinkingOffsetY: row.face_thinking_offset_y,
    },
    null,
  );
  // Preserve authored null rotation for default eyes (marketplace-facing fidelity).
  const faceEyeRotationDeg =
    row.face_eye_character === null || row.face_eye_character === ""
      ? row.face_eye_rotation_deg ?? null
      : faceStyle.eyeRotationDeg;
  const powers = normalizeBotPowersV1(parseJsonColumn(row.powers_json) ?? []);
  const visiblePrompt = stripBotProfileMetaSuffix(row.system_prompt).trim();
  const botJson = {
    schema: "prism-bot-export-v2",
    botHash,
    exportedAt: COLLECTION_REVISION,
    bot: {
      name,
      namePronunciation: normalizeBotNamePronunciation(row.name_pronunciation),
      selfReferral: normalizeBotSelfReferral(row.self_referral),
      color: typeof row.color === "string" && row.color.trim() ? row.color.trim() : null,
      glyph: typeof row.glyph === "string" && row.glyph.trim() ? row.glyph.trim() : null,
      avatarDetails: resolveAvatarDetails(row),
      temperature: numberOr(row.temperature, 0.7),
      maxTokens: numberOr(row.max_tokens, 2048),
      topP: numberOr(row.top_p, 1),
      topK: numberOr(row.top_k, 40),
      repetitionPenalty: numberOr(row.repetition_penalty, 1.1),
      localModel: typeof row.local_model === "string" ? row.local_model : "",
      onlineModel: typeof row.online_model === "string" ? row.online_model : "",
      localImageModel:
        typeof row.local_image_model === "string" ? row.local_image_model : "",
      openaiImageModel:
        typeof row.openai_image_model === "string" ? row.openai_image_model : "",
      faceEyesFont: faceStyle.eyesFont,
      faceEyeCharacter: faceStyle.eyeCharacter,
      faceEyeAnimation: faceStyle.eyeAnimation,
      faceMouthFont: faceStyle.mouthFont,
      faceMouthCharacter: faceStyle.mouthCharacter,
      faceMouthAnimation: faceStyle.mouthAnimation,
      faceMouthCoffeePucker: faceStyle.mouthCoffeePucker,
      faceFontWeight: faceStyle.weight,
      faceEyeScale: faceStyle.eyeScale,
      faceEyeOffsetX: faceStyle.eyeOffsetX,
      faceEyeOffsetY: faceStyle.eyeOffsetY,
      faceEyeRotationDeg,
      faceEyeCount: faceStyle.eyeCount,
      faceEyeSpacing: faceStyle.eyeSpacing,
      faceMouthScale: faceStyle.mouthScale,
      faceMouthOffsetX: faceStyle.mouthOffsetX,
      faceMouthOffsetY: faceStyle.mouthOffsetY,
      faceMouthRotationDeg: faceStyle.mouthRotationDeg,
      faceBlinkBar: faceStyle.blinkBar,
      faceBlinkScale: faceStyle.blinkScale,
      faceBlinkOffsetX: faceStyle.blinkOffsetX,
      faceBlinkOffsetY: faceStyle.blinkOffsetY,
      faceBlinkRotationDeg: faceStyle.blinkRotationDeg,
      faceThinkingFrames: faceStyle.thinkingFrames,
      faceThinkingScale: faceStyle.thinkingScale,
      faceThinkingOffsetX: faceStyle.thinkingOffsetX,
      faceThinkingOffsetY: faceStyle.thinkingOffsetY,
      onlineEnabled: row.online_enabled !== 0,
      flirtEnabled: row.flirt_enabled === 1,
      chatEnabled: row.chat_enabled !== 0,
      voicePreviewLine:
        typeof row.voice_preview_line === "string" ? row.voice_preview_line : null,
      authoredAudioVoiceProfile: stripElevenLabsIdentity(
        normalizeBotAudioVoiceProfileV1(
          parseJsonColumn(row.authored_audio_voice_profile),
        ),
      ),
      audioVoiceProfileOverride: stripElevenLabsIdentity(
        normalizeOptionalBotAudioVoiceProfileV1(
          parseJsonColumn(row.audio_voice_profile_override),
        ),
      ),
      ...(powers.length > 0 ? { powers } : {}),
    },
    profile,
    systemPrompt: visiblePrompt,
  };

  const bytes = createPrismBotArchive({ botJson, memories: [] });
  const parsed = parsePrismBotArchive(bytes);
  return {
    marketplaceId,
    name,
    botHash,
    botJson: parsed.botJson,
    bytes,
    bundlePath: join(MARKETPLACE_ROOT, "bots", `bot-${marketplaceId}.bot`),
    manifestEntry: {
      id: marketplaceId,
      name,
      subtitle: subtitleFor(profile, name),
      description: descriptionFor(profile, name),
      botHash,
      bundlePath: `/bot-marketplace/bots/bot-${marketplaceId}.bot`,
      memoryCount: 0,
      color: botJson.bot.color,
      glyph: botJson.bot.glyph,
      themeIds: [THEME_ID],
      tags: ["library-backup", "dev-only"],
      marketplaceVisible: true,
      deprecated: false,
      replacementType: null,
      replacementIds: [],
      branchLock: BRANCH_LOCK,
      ...(powers.length > 0 ? { powers } : {}),
    },
  };
}

const databasePath = resolve(databaseArgument);
const database = new DatabaseSync(databasePath, { readOnly: true });
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
if (manifest.schema !== "prism-bot-marketplace-v1") {
  throw new Error("Unsupported Marketplace manifest.");
}

let candidates;
try {
  const user = database.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) throw new Error("The requested Library user does not exist.");

  const marketHashes = new Set(
    (manifest.bots ?? [])
      .filter((entry) => entry?.themeIds?.[0] !== THEME_ID && entry?.id)
      .map((entry) => String(entry.botHash ?? "").toLowerCase())
      .filter(Boolean),
  );
  // Treat current public catalog + any non-backup shelves as "already on marketplace".
  const publicEntries = (manifest.bots ?? []).filter(
    (entry) =>
      entry?.themeIds?.[0] !== THEME_ID &&
      entry?.branchLock !== BRANCH_LOCK,
  );
  const publicHashes = new Set(
    publicEntries.map((entry) => String(entry.botHash ?? "").toLowerCase()),
  );
  const publicNames = new Set(
    publicEntries.map((entry) => String(entry.name ?? "").trim().toLowerCase()),
  );

  const libraryRows = database
    .prepare(
      `SELECT * FROM bots
        WHERE user_id = ?
        ORDER BY name COLLATE NOCASE`,
    )
    .all(userId);

  const libraryOnly = libraryRows.filter((row) => {
    const hash = String(row.export_hash ?? "").trim().toLowerCase();
    const name = String(row.name ?? "").trim().toLowerCase();
    return hash && name && !publicHashes.has(hash) && !publicNames.has(name);
  });

  const takenIds = new Set(
    (manifest.bots ?? [])
      .filter((entry) => entry?.themeIds?.[0] !== THEME_ID)
      .map((entry) => String(entry.id ?? "").toLowerCase())
      .filter(Boolean),
  );
  // Prefer stable ids already used by this backup shelf.
  const existingBackupByHash = new Map(
    (manifest.bots ?? [])
      .filter((entry) => entry?.themeIds?.includes?.(THEME_ID) || entry?.branchLock === BRANCH_LOCK)
      .map((entry) => [String(entry.botHash ?? "").toLowerCase(), String(entry.id)]),
  );

  candidates = libraryOnly.map((row) => {
    const hash = String(row.export_hash ?? "").trim().toLowerCase();
    const existingId = existingBackupByHash.get(hash);
    const marketplaceId = existingId || uniqueMarketplaceId(row.name, takenIds);
    takenIds.add(marketplaceId);
    return buildCandidate(row, marketplaceId);
  });

  void marketHashes;
} finally {
  database.close();
}

const candidateIds = new Set(candidates.map((candidate) => candidate.marketplaceId));
const candidateHashes = new Set(candidates.map((candidate) => candidate.botHash));
for (const entry of manifest.bots ?? []) {
  if (candidateIds.has(entry.id)) continue;
  if (entry.themeIds?.includes?.(THEME_ID) || entry.branchLock === BRANCH_LOCK) continue;
  if (candidateHashes.has(String(entry.botHash ?? "").toLowerCase())) {
    throw new Error(`Marketplace hash collision with ${entry.id} (${entry.name}).`);
  }
}

function archiveDiffFields(candidate) {
  if (!existsSync(candidate.bundlePath)) return ["bundle"];
  try {
    const current = parsePrismBotArchive(readFileSync(candidate.bundlePath));
    const currentBotJson = structuredClone(current.botJson);
    const nextBotJson = structuredClone(candidate.botJson);
    delete currentBotJson.exportedAt;
    delete nextBotJson.exportedAt;
    if (
      JSON.stringify(currentBotJson) === JSON.stringify(nextBotJson) &&
      current.memories.length === 0
    ) {
      return [];
    }
    const fields = [];
    const currentBot = currentBotJson.bot ?? {};
    const nextBot = nextBotJson.bot ?? {};
    for (const field of new Set([
      ...Object.keys(currentBot),
      ...Object.keys(nextBot),
    ])) {
      if (JSON.stringify(currentBot[field]) !== JSON.stringify(nextBot[field])) {
        fields.push(field);
      }
    }
    for (const field of ["schema", "botHash", "profile", "systemPrompt"]) {
      if (
        JSON.stringify(currentBotJson[field]) !==
        JSON.stringify(nextBotJson[field])
      ) {
        fields.push(field);
      }
    }
    if (current.memories.length !== 0) fields.push("memories");
    return fields.length > 0 ? fields : ["archive"];
  } catch {
    return ["bundle"];
  }
}

const archiveDiffs = new Map(
  candidates.map((candidate) => [
    candidate.marketplaceId,
    archiveDiffFields(candidate),
  ]),
);
const changedCandidates = candidates.filter(
  (candidate) => archiveDiffs.get(candidate.marketplaceId)?.length > 0,
);
const staleBackupBundles = (manifest.bots ?? [])
  .filter(
    (entry) =>
      (entry.themeIds?.includes?.(THEME_ID) || entry.branchLock === BRANCH_LOCK) &&
      !candidateIds.has(entry.id),
  )
  .map((entry) => join(MARKETPLACE_ROOT, "bots", `bot-${entry.id}.bot`))
  .filter((bundlePath) => existsSync(bundlePath));

const currentManifestText = readFileSync(MANIFEST_PATH, "utf8");
const nextManifestBase = {
  ...manifest,
  version: Math.max(Number(manifest.version) || 1, COLLECTION_VERSION),
  updatedAt: manifest.updatedAt,
  themes: [
    ...(manifest.themes ?? []).filter((theme) => theme.id !== THEME_ID),
    {
      ...THEME,
      botIds: candidates.map((candidate) => candidate.marketplaceId),
    },
  ],
  bots: [
    ...(manifest.bots ?? []).filter(
      (entry) =>
        !candidateIds.has(entry.id) &&
        entry.themeIds?.[0] !== THEME_ID &&
        entry.branchLock !== BRANCH_LOCK,
    ),
    ...candidates.map((candidate) => candidate.manifestEntry),
  ],
};
const manifestContentChanged =
  currentManifestText !== `${JSON.stringify(nextManifestBase, null, 2)}\n`;
const collectionChanged =
  changedCandidates.length > 0 ||
  staleBackupBundles.length > 0 ||
  manifestContentChanged;
const nextManifest = {
  ...nextManifestBase,
  updatedAt: collectionChanged ? COLLECTION_REVISION : manifest.updatedAt,
};
const nextManifestText = `${JSON.stringify(nextManifest, null, 2)}\n`;
const manifestChanged = currentManifestText !== nextManifestText;

let backupPath = null;
if (shouldApply) {
  backupPath = resolve(backupArgument);
  if (existsSync(backupPath)) {
    throw new Error(`Refusing to overwrite existing backup directory: ${backupPath}`);
  }
  mkdirSync(backupPath, { recursive: true });
  copyFileSync(MANIFEST_PATH, join(backupPath, "manifest.json"));
  for (const candidate of candidates) {
    if (existsSync(candidate.bundlePath)) {
      copyFileSync(candidate.bundlePath, join(backupPath, basename(candidate.bundlePath)));
    }
  }
  for (const bundlePath of staleBackupBundles) {
    copyFileSync(bundlePath, join(backupPath, basename(bundlePath)));
  }

  for (const candidate of changedCandidates) {
    const stagedPath = `${candidate.bundlePath}.library-dev-backup-staged`;
    if (existsSync(stagedPath)) {
      throw new Error(`Refusing to overwrite staged bundle: ${stagedPath}`);
    }
    mkdirSync(dirname(candidate.bundlePath), { recursive: true });
    writeFileSync(stagedPath, candidate.bytes);
    const staged = parsePrismBotArchive(readFileSync(stagedPath));
    if (
      JSON.stringify(staged.botJson) !== JSON.stringify(candidate.botJson) ||
      staged.memories.length !== 0
    ) {
      throw new Error(`Staged archive validation failed for ${candidate.name}.`);
    }
    renameSync(stagedPath, candidate.bundlePath);
  }

  if (manifestChanged) {
    const stagedManifestPath = `${MANIFEST_PATH}.library-dev-backup-staged`;
    if (existsSync(stagedManifestPath)) {
      throw new Error(`Refusing to overwrite staged manifest: ${stagedManifestPath}`);
    }
    writeFileSync(stagedManifestPath, nextManifestText);
    JSON.parse(readFileSync(stagedManifestPath, "utf8"));
    renameSync(stagedManifestPath, MANIFEST_PATH);
  }
}

console.log(
  JSON.stringify(
    {
      mode: shouldApply ? "apply" : "dry-run",
      database: databasePath,
      theme: {
        id: THEME.id,
        name: THEME.name,
        branchLock: THEME.branchLock,
        botCount: candidates.length,
      },
      roster: candidates.map((candidate) => ({
        id: candidate.marketplaceId,
        name: candidate.name,
        botHash: candidate.botHash,
        changed: changedCandidates.includes(candidate),
        fields: archiveDiffs.get(candidate.marketplaceId),
      })),
      changedBundles: changedCandidates.length,
      staleBundles: staleBackupBundles.map((bundlePath) => basename(bundlePath)),
      manifestChanged,
      backup: backupPath,
    },
    null,
    2,
  ),
);
