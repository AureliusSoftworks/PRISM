#!/usr/bin/env node
/**
 * Align Marketplace (and matching Library) built-in Prism voice slots with
 * character pronouns. Male-presenting bots leave feminine Kokoro voices, and
 * vice versa. they/them and ambiguous pronouns are left alone.
 *
 * Usage:
 *   node --experimental-strip-types scripts/update-marketplace-bot-voice-genders.mjs --dry-run --db PATH
 *   node --experimental-strip-types scripts/update-marketplace-bot-voice-genders.mjs --apply \
 *     --db PATH --workspace-backup PATH --db-backup PATH [--user-id ID]
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
  BOT_AUDIO_VOICE_IDS,
  normalizeBotAudioVoiceProfileV1,
  PRISM_BUILTIN_ENGLISH_VOICES,
  serializeBotAudioVoiceProfileV1,
} from "@localai/shared";

const root = resolve(import.meta.dirname, "..");
const marketplaceRoot = join(root, "apps/web/public/bot-marketplace");
const manifestPath = join(marketplaceRoot, "manifest.json");

/** @typedef {"feminine" | "masculine"} VoiceGender */
/** @typedef {"feminine" | "masculine" | "neutral"} CharacterGender */

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");
const databaseArgument = flagValue("--db");
const userIdArgument = flagValue("--user-id");
const workspaceBackupArgument = flagValue("--workspace-backup");
const databaseBackupArgument = flagValue("--db-backup");
const onlyArgument = flagValue("--only");

if (shouldApply && explicitDryRun) {
  throw new Error("Choose either --dry-run or --apply, not both.");
}
if (!shouldApply && !explicitDryRun) {
  throw new Error("Provide --dry-run or --apply.");
}
if (shouldApply && !workspaceBackupArgument) {
  throw new Error("Applying Marketplace updates requires --workspace-backup PATH.");
}
if (shouldApply && databaseArgument && !databaseBackupArgument) {
  throw new Error("Applying Library updates requires --db-backup PATH.");
}
if (databaseBackupArgument && !databaseArgument) {
  throw new Error("--db-backup requires --db PATH.");
}

const onlyIds = onlyArgument
  ? new Set(
      onlyArgument
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    )
  : null;

/** @type {ReadonlyMap<string, VoiceGender>} */
const voiceGenderById = new Map(
  PRISM_BUILTIN_ENGLISH_VOICES.map((voice) => {
    const prefix = voice.engineVoiceId.slice(0, 2);
    if (prefix === "af" || prefix === "bf") return [voice.voiceId, "feminine"];
    if (prefix === "am" || prefix === "bm") return [voice.voiceId, "masculine"];
    throw new Error(`Unrecognized Kokoro gender prefix in ${voice.engineVoiceId}.`);
  }),
);

/** @type {ReadonlyMap<string, string>} */
const voiceLocaleById = new Map(
  PRISM_BUILTIN_ENGLISH_VOICES.map((voice) => [voice.voiceId, voice.locale]),
);

/**
 * @param {unknown} pronouns
 * @returns {CharacterGender}
 */
function characterGenderFromPronouns(pronouns) {
  const text = String(pronouns ?? "")
    .trim()
    .toLowerCase();
  if (!text) return "neutral";
  const hasHe = /\bhe\b|\bhim\b|\bhis\b/u.test(text);
  const hasShe = /\bshe\b|\bher\b|\bhers\b/u.test(text);
  const hasThey = /\bthey\b|\bthem\b|\btheir\b/u.test(text);
  if (hasHe && !hasShe) return "masculine";
  if (hasShe && !hasHe) return "feminine";
  if (hasThey && !hasHe && !hasShe) return "neutral";
  return "neutral";
}

/**
 * @param {string} seed
 * @param {number} length
 */
function stableIndex(seed, length) {
  if (length <= 0) throw new Error("Cannot index an empty voice pool.");
  const digest = createHash("sha256").update(seed).digest();
  return digest.readUInt32BE(0) % length;
}

/**
 * @param {CharacterGender} characterGender
 * @param {string | null | undefined} currentVoiceId
 * @param {string} botId
 */
function chooseAlignedVoiceId(characterGender, currentVoiceId, botId) {
  if (characterGender === "neutral") return currentVoiceId ?? "voice-1";
  const targetGender =
    characterGender === "masculine" ? "masculine" : "feminine";
  const current =
    typeof currentVoiceId === "string" &&
    BOT_AUDIO_VOICE_IDS.includes(/** @type {any} */ (currentVoiceId))
      ? currentVoiceId
      : null;
  if (current && voiceGenderById.get(current) === targetGender) {
    return current;
  }
  const preferredLocale = current ? voiceLocaleById.get(current) : null;
  const gendered = BOT_AUDIO_VOICE_IDS.filter(
    (voiceId) => voiceGenderById.get(voiceId) === targetGender,
  );
  const localeMatched = preferredLocale
    ? gendered.filter((voiceId) => voiceLocaleById.get(voiceId) === preferredLocale)
    : [];
  const pool = localeMatched.length > 0 ? localeMatched : gendered;
  return pool[stableIndex(`voice-gender:${botId}:${targetGender}`, pool.length)];
}

/**
 * @param {unknown} profile
 * @param {string} nextVoiceId
 */
function withBaseVoiceId(profile, nextVoiceId) {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  if (normalized.baseVoiceId === nextVoiceId) return normalized;
  return normalizeBotAudioVoiceProfileV1({
    ...normalized,
    baseVoiceId: nextVoiceId,
  });
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
    execFileSync("unzip", ["-p", bundlePath, "bot.json"], { encoding: "utf8" }),
  );
  if (document.botHash !== entry.botHash || document.bot?.name !== entry.name) {
    throw new Error(`${entry.name} bundle identity does not match the manifest.`);
  }
  return { bundlePath, entryNames, document };
}

/**
 * @param {Record<string, unknown>} row
 */
function protectedStateHash(row) {
  const protectedRow = Object.fromEntries(
    Object.entries(row).filter(
      ([column]) =>
        column !== "authored_audio_voice_profile" && column !== "updated_at",
    ),
  );
  return createHash("sha256").update(JSON.stringify(protectedRow)).digest("hex");
}

function assertDatabaseIntegrity(database, label) {
  const integrity = database.prepare("PRAGMA integrity_check").get();
  if (integrity?.integrity_check !== "ok") {
    throw new Error(`${label} failed SQLite integrity_check.`);
  }
}

/**
 * @param {any} document
 * @param {string} botId
 */
function planVoiceUpdate(document, botId) {
  const pronouns =
    document.profile?.identity?.pronouns ??
    document.bot?.profile?.identity?.pronouns ??
    "";
  const characterGender = characterGenderFromPronouns(pronouns);
  const authored = normalizeBotAudioVoiceProfileV1(
    document.bot?.authoredAudioVoiceProfile,
  );
  const overrideRaw = document.bot?.audioVoiceProfileOverride ?? null;
  const override = overrideRaw
    ? normalizeBotAudioVoiceProfileV1(overrideRaw)
    : null;

  const nextAuthoredVoiceId = chooseAlignedVoiceId(
    characterGender,
    authored.baseVoiceId,
    botId,
  );
  const nextOverrideVoiceId = override
    ? chooseAlignedVoiceId(characterGender, override.baseVoiceId, `${botId}:override`)
    : null;

  const nextAuthored = withBaseVoiceId(authored, nextAuthoredVoiceId);
  const nextOverride =
    override && nextOverrideVoiceId
      ? withBaseVoiceId(override, nextOverrideVoiceId)
      : override;

  const authoredChanged = authored.baseVoiceId !== nextAuthored.baseVoiceId;
  const overrideChanged = Boolean(
    override &&
      nextOverride &&
      override.baseVoiceId !== nextOverride.baseVoiceId,
  );

  return {
    pronouns: String(pronouns || ""),
    characterGender,
    fromAuthored: authored.baseVoiceId,
    toAuthored: nextAuthored.baseVoiceId,
    fromOverride: override?.baseVoiceId ?? null,
    toOverride: nextOverride?.baseVoiceId ?? null,
    authoredChanged,
    overrideChanged,
    marketplaceChanged: authoredChanged || overrideChanged,
    nextAuthored,
    nextOverride,
    skippedNeutral: characterGender === "neutral",
  };
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const catalogEntries = manifest.bots.filter((entry) =>
  onlyIds ? onlyIds.has(entry.id) : true,
);

const targets = catalogEntries.map((entry) => {
  const bundle = readBundle(entry);
  const plan = planVoiceUpdate(bundle.document, entry.id);
  return {
    entry,
    ...bundle,
    plan,
    authoredJson: serializeBotAudioVoiceProfileV1(plan.nextAuthored),
    overrideJson: plan.nextOverride
      ? serializeBotAudioVoiceProfileV1(plan.nextOverride)
      : null,
    marketplaceChanged: plan.marketplaceChanged,
  };
});

const mismatchedTargets = targets.filter(
  (targetEntry) => targetEntry.marketplaceChanged,
);

let db = null;
let resolvedUserId = userIdArgument;
let installedTargets = [];
if (databaseArgument) {
  db = new DatabaseSync(resolve(databaseArgument), { readOnly: !shouldApply });
  const users = db.prepare("SELECT id FROM users ORDER BY created_at ASC").all();
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
  installedTargets = mismatchedTargets.flatMap((targetEntry) => {
    if (!targetEntry.plan.authoredChanged) return [];
    const rows = db
      .prepare("SELECT * FROM bots WHERE user_id = ? AND export_hash = ?")
      .all(resolvedUserId, targetEntry.entry.botHash);
    if (rows.length > 1) {
      throw new Error(`Found duplicate installed rows for ${targetEntry.entry.name}.`);
    }
    if (rows.length === 0) return [];
    const row = rows[0];
    const currentAuthored = normalizeBotAudioVoiceProfileV1(
      row.authored_audio_voice_profile
        ? JSON.parse(row.authored_audio_voice_profile)
        : undefined,
    );
    const nextAuthored = withBaseVoiceId(
      currentAuthored,
      targetEntry.plan.toAuthored,
    );
    const authoredJson = serializeBotAudioVoiceProfileV1(nextAuthored);
    return [
      {
        ...targetEntry,
        row,
        authoredJson,
        libraryChanged: currentAuthored.baseVoiceId !== nextAuthored.baseVoiceId,
        protectedStateHash: protectedStateHash(row),
      },
    ];
  });
  assertDatabaseIntegrity(db, "Live database before update");
}

let workspaceBackupPath = null;
let databaseBackupPath = null;
let marketplaceUpdatedAt = null;
let transactionOpen = false;

try {
  if (shouldApply) {
    workspaceBackupPath = resolve(workspaceBackupArgument);
    if (existsSync(workspaceBackupPath)) {
      throw new Error(`Refusing to overwrite workspace backup: ${workspaceBackupPath}`);
    }
    mkdirSync(workspaceBackupPath, { recursive: true });
    copyFileSync(manifestPath, join(workspaceBackupPath, "manifest.json"));
    for (const targetEntry of mismatchedTargets) {
      copyFileSync(
        targetEntry.bundlePath,
        join(workspaceBackupPath, basename(targetEntry.bundlePath)),
      );
    }

    if (mismatchedTargets.length > 0) {
      marketplaceUpdatedAt = new Date().toISOString();
      for (const targetEntry of mismatchedTargets) {
        const scratch = mkdtempSync(join(tmpdir(), "prism-marketplace-voice-gender-"));
        try {
          execFileSync("unzip", ["-qq", targetEntry.bundlePath, "-d", scratch]);
          const botJsonPath = join(scratch, "bot.json");
          const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
          document.bot.authoredAudioVoiceProfile = targetEntry.plan.nextAuthored;
          if (targetEntry.plan.overrideChanged) {
            document.bot.audioVoiceProfileOverride = targetEntry.plan.nextOverride;
          }
          document.exportedAt = marketplaceUpdatedAt;
          writeFileSync(botJsonPath, `${JSON.stringify(document, null, 2)}\n`);
          const rebuiltPath = join(scratch, basename(targetEntry.bundlePath));
          execFileSync("zip", ["-X", "-q", rebuiltPath, ...targetEntry.entryNames], {
            cwd: scratch,
          });
          renameSync(rebuiltPath, targetEntry.bundlePath);
        } finally {
          rmSync(scratch, { recursive: true, force: true });
        }
      }
      manifest.updatedAt = marketplaceUpdatedAt;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }

    if (db) {
      databaseBackupPath = resolve(databaseBackupArgument);
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

      const changedLibraryTargets = installedTargets.filter(
        (targetEntry) => targetEntry.libraryChanged,
      );
      if (changedLibraryTargets.length > 0) {
        const update = db.prepare(
          "UPDATE bots SET authored_audio_voice_profile = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        );
        const updatedAt = new Date().toISOString();
        db.exec("BEGIN IMMEDIATE");
        transactionOpen = true;
        for (const targetEntry of changedLibraryTargets) {
          const result = update.run(
            targetEntry.authoredJson,
            updatedAt,
            targetEntry.row.id,
            resolvedUserId,
          );
          if (result.changes !== 1) {
            throw new Error(`Could not update installed ${targetEntry.entry.name}.`);
          }
        }
        for (const targetEntry of installedTargets) {
          const row = db
            .prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?")
            .get(targetEntry.row.id, resolvedUserId);
          if (!row || row.authored_audio_voice_profile !== targetEntry.authoredJson) {
            throw new Error(`${targetEntry.entry.name} voice sync did not persist.`);
          }
          if (protectedStateHash(row) !== targetEntry.protectedStateHash) {
            throw new Error(
              `${targetEntry.entry.name} personal state changed outside authored voice.`,
            );
          }
        }
        db.exec("COMMIT");
        transactionOpen = false;
      }
      assertDatabaseIntegrity(db, "Live database after update");
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: shouldApply ? "apply" : "dry-run",
        marketplace: {
          scanned: targets.length,
          changed: mismatchedTargets.length,
          unchanged: targets.length - mismatchedTargets.length,
          neutralSkipped: targets.filter((entry) => entry.plan.skippedNeutral)
            .length,
          updatedAt: marketplaceUpdatedAt,
          workspaceBackupPath,
          bots: mismatchedTargets.map((targetEntry) => ({
            id: targetEntry.entry.id,
            name: targetEntry.entry.name,
            pronouns: targetEntry.plan.pronouns,
            characterGender: targetEntry.plan.characterGender,
            authored: `${targetEntry.plan.fromAuthored} → ${targetEntry.plan.toAuthored}`,
            override:
              targetEntry.plan.fromOverride || targetEntry.plan.toOverride
                ? `${targetEntry.plan.fromOverride ?? "—"} → ${targetEntry.plan.toOverride ?? "—"}`
                : null,
            branchLock: targetEntry.entry.branchLock ?? null,
          })),
        },
        library: db
          ? {
              userId: resolvedUserId,
              installedMatches: installedTargets.length,
              changed: installedTargets.filter((entry) => entry.libraryChanged)
                .length,
              unchanged: installedTargets.filter((entry) => !entry.libraryChanged)
                .length,
              missing: mismatchedTargets.filter((targetEntry) => targetEntry.plan.authoredChanged)
                .length - installedTargets.length,
              databaseBackupPath,
              bots: installedTargets.map((targetEntry) => ({
                marketplaceName: targetEntry.entry.name,
                installedName: targetEntry.row.name,
                changed: targetEntry.libraryChanged,
                authored: `${targetEntry.plan.fromAuthored} → ${targetEntry.plan.toAuthored}`,
              })),
              missingBots: mismatchedTargets
                .filter((targetEntry) => targetEntry.plan.authoredChanged)
                .filter(
                  (targetEntry) =>
                    !installedTargets.some(
                      (installed) => installed.entry.id === targetEntry.entry.id,
                    ),
                )
                .map((targetEntry) => ({
                  id: targetEntry.entry.id,
                  name: targetEntry.entry.name,
                })),
            }
          : { skipped: true },
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (transactionOpen && db) db.exec("ROLLBACK");
  throw error;
} finally {
  db?.close();
}
