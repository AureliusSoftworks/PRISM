#!/usr/bin/env node
/**
 * Curate Marketplace (and matching Library) built-in Prism voice slots by
 * persona. Every selection uses the portable voice pack, follows character
 * pronouns, uses the available American/British locale when it genuinely fits,
 * and otherwise favors the closest vocal character without inventing an accent.
 *
 * The filename is retained for compatibility with existing maintenance notes.
 * Only the local voice identity changes inside a voice profile: baseVoiceId is
 * curated and any host-specific systemVoiceName is cleared so the installed
 * pack is authoritative. Performance, effects, online provider identity, and
 * every other bot field remain untouched.
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
} from "@localai/shared";

const root = resolve(import.meta.dirname, "..");
const marketplaceRoot = join(root, "apps/web/public/bot-marketplace");
const manifestPath = join(marketplaceRoot, "manifest.json");

/** @typedef {"feminine" | "masculine"} VoiceGender */
/** @typedef {"feminine" | "masculine" | "neutral"} CharacterGender */

/**
 * Author-reviewed portable voice identities. Heart remains available to bot
 * authors, but no bundled persona uses the generic default. British voices are
 * reserved for personas whose authored delivery is explicitly British; the
 * pack does not pretend to supply French, Indian, German, or other accents it
 * does not install.
 */
const CURATED_BOT_IDS_BY_VOICE = {
  "voice-1": [],
  "voice-2": [
    "iris",
    "marie-antoinette",
    "tiny-bill",
    "alias-avery"
  ],
  "voice-3": [
    "rowan",
    "george-washington",
    "thomas-jefferson",
    "james-madison",
    "socrates",
    "aristotle",
    "confucius",
    "the-buddha",
    "jesus-christ",
    "laozi",
    "guru-nanak",
    "vincent-van-gogh",
    "claude-monet",
    "machiavelli",
    "sun-tzu",
    "chanakya",
    "sigmund-freud",
    "joseph-campbell",
    "nikola-tesla",
    "albert-einstein",
    "mahatma-gandhi",
    "abraham-lincoln",
    "bob-ross",
    "brian-griffin",
    "identity-crisis-irene",
    "jordan-peterson",
    "l",
    "light-yagami",
    "mr-rogers",
    "sam-harris",
    "squidward",
    "interrupting-tom",
    "identity-crisis-ian",
    "following-jackson",
    "fibbing-phil",
    "spectral-spencer"
  ],
  "voice-4": [
    "pia",
    "mary-shelley",
    "jane-austen",
    "professor-mcgonagall",
    "sad-sally"
  ],
  "voice-5": [
    "thomas-hobbes",
    "isaac-newton",
    "charles-darwin",
    "obi-wan-kenobi",
    "quiet-tim",
    "crazy-brenda"
  ],
  "voice-6": ["sol", "misa-amane", "lazy-cameron"],
  "voice-7": [
    "mira",
    "marie-curie",
    "harriet-tubman",
    "kris-jenner",
    "mumbling-jim"
  ],
  "voice-8": ["khloe-kardashian", "kim-kardashian"],
  "voice-9": ["georgia-okeeffe", "echo-ellen", "kourtney-kardashian-barker", "shapeshifter-sam"],
  "voice-10": [
    "plato",
    "marcus-aurelius",
    "carl-von-clausewitz",
    "carl-jung",
    "friedrich-nietzsche",
    "martin-luther-king-jr",
    "nelson-mandela",
    "frederick-douglass",
    "edgar-allan-poe",
    "homer",
    "darth-vader",
    "barack-obama",
    "donald-trump",
    "joseph-stalin",
    "maximilien-robespierre",
    "mr-krabs",
    "rick-sanchez",
    "ryuk",
    "silent-jack",
    "obsessed-kevin"
  ],
  "voice-11": [
    "benjamin-franklin",
    "john-adams",
    "rumi",
    "leonardo-da-vinci",
    "salvador-dali",
    "adolf-hitler",
    "bernie-sanders",
    "joseph-smith-jr",
    "morty-smith",
    "near",
    "patrick-star",
    "peter-griffin",
    "plankton",
    "scatterbrained-steven",
    "spongebob-squarepants",
    "copycat-calvin",
    "forgetful-freddie"
  ],
  "voice-12": [
    "william-shakespeare",
    "alan-watts",
    "andy-hominem",
    "hagrid",
    "harry-potter",
    "stewie-griffin",
    "joyful-nora"
  ],
};

/** @type {ReadonlyMap<string, import("@localai/shared").BotAudioVoiceId>} */
const curatedVoiceIdByBotId = new Map(
  Object.entries(CURATED_BOT_IDS_BY_VOICE).flatMap(([voiceId, botIds]) =>
    botIds.map((botId) => [botId, voiceId]),
  ),
);

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
  throw new Error(
    "Applying Marketplace updates requires --workspace-backup PATH.",
  );
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
    throw new Error(
      `Unrecognized Kokoro gender prefix in ${voice.engineVoiceId}.`,
    );
  }),
);

/** @type {ReadonlyMap<string, (typeof PRISM_BUILTIN_ENGLISH_VOICES)[number]>} */
const voiceById = new Map(
  PRISM_BUILTIN_ENGLISH_VOICES.map((voice) => [voice.voiceId, voice]),
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
 * @param {string} botId
 * @param {CharacterGender} characterGender
 */
function chooseCuratedVoiceId(botId, characterGender) {
  const voiceId = curatedVoiceIdByBotId.get(botId);
  if (!voiceId || !BOT_AUDIO_VOICE_IDS.includes(voiceId)) {
    throw new Error(`No valid curated PRISM voice for ${botId}.`);
  }
  if (
    characterGender !== "neutral" &&
    voiceGenderById.get(voiceId) !== characterGender
  ) {
    throw new Error(
      `${botId} uses ${voiceId}, which does not match ${characterGender} pronouns.`,
    );
  }
  return voiceId;
}

/**
 * @param {unknown} profile
 * @param {string} nextVoiceId
 */
function withBuiltinVoiceIdentity(profile, nextVoiceId) {
  const source =
    profile && typeof profile === "object" && !Array.isArray(profile)
      ? structuredClone(profile)
      : {};
  const next = {
    ...source,
    baseVoiceId: nextVoiceId,
  };
  delete next.systemVoiceName;
  return next;
}

/** @param {unknown} profile */
function protectedVoiceProfileHash(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return createHash("sha256").update("{}").digest("hex");
  }
  const protectedProfile = Object.fromEntries(
    Object.entries(profile).filter(
      ([field]) => field !== "baseVoiceId" && field !== "systemVoiceName",
    ),
  );
  return createHash("sha256")
    .update(JSON.stringify(protectedProfile))
    .digest("hex");
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
    throw new Error(
      `${entry.name} bundle identity does not match the manifest.`,
    );
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
        column !== "authored_audio_voice_profile" &&
        column !== "audio_voice_profile_override" &&
        column !== "updated_at",
    ),
  );
  return createHash("sha256")
    .update(JSON.stringify(protectedRow))
    .digest("hex");
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
  const authoredRaw = document.bot?.authoredAudioVoiceProfile;
  const authored = normalizeBotAudioVoiceProfileV1(authoredRaw);
  const overrideRaw = document.bot?.audioVoiceProfileOverride ?? null;
  const override = overrideRaw
    ? normalizeBotAudioVoiceProfileV1(overrideRaw)
    : null;

  const nextAuthoredVoiceId = chooseCuratedVoiceId(botId, characterGender);
  const nextOverrideVoiceId = override ? nextAuthoredVoiceId : null;

  const nextAuthored = withBuiltinVoiceIdentity(
    authoredRaw,
    nextAuthoredVoiceId,
  );
  const nextOverride =
    override && nextOverrideVoiceId
      ? withBuiltinVoiceIdentity(overrideRaw, nextOverrideVoiceId)
      : override;

  const authoredChanged =
    authored.baseVoiceId !== nextAuthored.baseVoiceId ||
    Boolean(authored.systemVoiceName);
  const overrideChanged = Boolean(
    override &&
    nextOverride &&
    (override.baseVoiceId !== nextOverride.baseVoiceId ||
      override.systemVoiceName),
  );

  return {
    pronouns: String(pronouns || ""),
    characterGender,
    fromAuthored: authored.baseVoiceId,
    toAuthored: nextAuthored.baseVoiceId,
    fromOverride: override?.baseVoiceId ?? null,
    toOverride: nextOverride?.baseVoiceId ?? null,
    fromAuthoredSystemVoice: authored.systemVoiceName ?? null,
    fromOverrideSystemVoice: override?.systemVoiceName ?? null,
    authoredChanged,
    overrideChanged,
    marketplaceChanged: authoredChanged || overrideChanged,
    nextAuthored,
    nextOverride,
    voice: voiceById.get(nextAuthoredVoiceId),
    neutralPronouns: characterGender === "neutral",
    authoredProtectedHash: protectedVoiceProfileHash(authoredRaw),
    overrideProtectedHash: protectedVoiceProfileHash(overrideRaw),
  };
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const manifestIds = new Set(manifest.bots.map((entry) => entry.id));
const missingVoiceIds = [...manifestIds].filter(
  (botId) => !curatedVoiceIdByBotId.has(botId),
);
const extraVoiceIds = [...curatedVoiceIdByBotId.keys()].filter(
  (botId) => !manifestIds.has(botId),
);
if (missingVoiceIds.length > 0 || extraVoiceIds.length > 0) {
  throw new Error(
    `Curated voice map mismatch. Missing: ${missingVoiceIds.join(", ") || "—"}; extra: ${extraVoiceIds.join(", ") || "—"}.`,
  );
}
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
    authoredJson: JSON.stringify(plan.nextAuthored),
    overrideJson: plan.nextOverride ? JSON.stringify(plan.nextOverride) : null,
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
  const users = db
    .prepare("SELECT id FROM users ORDER BY created_at ASC")
    .all();
  if (!resolvedUserId) {
    if (users.length !== 1) {
      throw new Error(
        `Library contains ${users.length} users; provide --user-id explicitly.`,
      );
    }
    resolvedUserId = users[0].id;
  }
  if (!users.some((user) => user.id === resolvedUserId)) {
    throw new Error(
      "The requested Library user does not exist in this database.",
    );
  }
  installedTargets = targets.flatMap((targetEntry) => {
    let rows = db
      .prepare("SELECT * FROM bots WHERE user_id = ? AND export_hash = ?")
      .all(resolvedUserId, targetEntry.entry.botHash);
    let matchKind = "export_hash";
    if (rows.length === 0) {
      rows = db
        .prepare(
          "SELECT * FROM bots WHERE user_id = ? AND lower(name) = lower(?)",
        )
        .all(resolvedUserId, targetEntry.entry.name);
      matchKind = "exact_name";
    }
    if (rows.length > 1) {
      throw new Error(
        `Found duplicate installed rows for ${targetEntry.entry.name}.`,
      );
    }
    if (rows.length === 0) return [];
    const row = rows[0];
    const currentAuthoredRaw = row.authored_audio_voice_profile
      ? JSON.parse(row.authored_audio_voice_profile)
      : undefined;
    const currentOverrideRaw = row.audio_voice_profile_override
      ? JSON.parse(row.audio_voice_profile_override)
      : null;
    const currentAuthored = normalizeBotAudioVoiceProfileV1(currentAuthoredRaw);
    const currentOverride = currentOverrideRaw
      ? normalizeBotAudioVoiceProfileV1(currentOverrideRaw)
      : null;
    const nextAuthored = withBuiltinVoiceIdentity(
      currentAuthoredRaw,
      targetEntry.plan.toAuthored,
    );
    const nextOverride = currentOverrideRaw
      ? withBuiltinVoiceIdentity(
          currentOverrideRaw,
          targetEntry.plan.toAuthored,
        )
      : null;
    const authoredJson = JSON.stringify(nextAuthored);
    const overrideJson = nextOverride ? JSON.stringify(nextOverride) : null;
    const authoredChanged =
      currentAuthored.baseVoiceId !== nextAuthored.baseVoiceId ||
      Boolean(currentAuthored.systemVoiceName);
    const overrideChanged = Boolean(
      currentOverride &&
      nextOverride &&
      (currentOverride.baseVoiceId !== nextOverride.baseVoiceId ||
        currentOverride.systemVoiceName),
    );
    return [
      {
        ...targetEntry,
        row,
        matchKind,
        authoredJson,
        overrideJson,
        libraryFromAuthored: currentAuthored.baseVoiceId,
        libraryToAuthored: nextAuthored.baseVoiceId,
        libraryFromOverride: currentOverride?.baseVoiceId ?? null,
        libraryToOverride: nextOverride?.baseVoiceId ?? null,
        libraryFromAuthoredSystemVoice: currentAuthored.systemVoiceName ?? null,
        libraryFromOverrideSystemVoice:
          currentOverride?.systemVoiceName ?? null,
        libraryChanged: authoredChanged || overrideChanged,
        protectedStateHash: protectedStateHash(row),
        authoredProtectedHash: protectedVoiceProfileHash(currentAuthoredRaw),
        overrideProtectedHash: protectedVoiceProfileHash(currentOverrideRaw),
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
      throw new Error(
        `Refusing to overwrite workspace backup: ${workspaceBackupPath}`,
      );
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
        const scratch = mkdtempSync(
          join(tmpdir(), "prism-marketplace-voice-gender-"),
        );
        try {
          execFileSync("unzip", ["-qq", targetEntry.bundlePath, "-d", scratch]);
          const botJsonPath = join(scratch, "bot.json");
          const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
          document.bot.authoredAudioVoiceProfile =
            targetEntry.plan.nextAuthored;
          if (targetEntry.plan.overrideChanged) {
            document.bot.audioVoiceProfileOverride =
              targetEntry.plan.nextOverride;
          }
          if (
            protectedVoiceProfileHash(
              document.bot.authoredAudioVoiceProfile,
            ) !== targetEntry.plan.authoredProtectedHash ||
            protectedVoiceProfileHash(
              document.bot.audioVoiceProfileOverride ?? null,
            ) !== targetEntry.plan.overrideProtectedHash
          ) {
            throw new Error(
              `${targetEntry.entry.name} changed outside the base voice identity.`,
            );
          }
          document.exportedAt = marketplaceUpdatedAt;
          writeFileSync(botJsonPath, `${JSON.stringify(document, null, 2)}\n`);
          const rebuiltPath = join(scratch, basename(targetEntry.bundlePath));
          execFileSync(
            "zip",
            ["-X", "-q", rebuiltPath, ...targetEntry.entryNames],
            {
              cwd: scratch,
            },
          );
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
        throw new Error(
          "The database backup path must differ from the live database.",
        );
      }
      if (existsSync(databaseBackupPath)) {
        throw new Error(
          `Refusing to overwrite database backup: ${databaseBackupPath}`,
        );
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
          "UPDATE bots SET authored_audio_voice_profile = ?, audio_voice_profile_override = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        );
        const updatedAt = new Date().toISOString();
        db.exec("BEGIN IMMEDIATE");
        transactionOpen = true;
        for (const targetEntry of changedLibraryTargets) {
          const result = update.run(
            targetEntry.authoredJson,
            targetEntry.overrideJson,
            updatedAt,
            targetEntry.row.id,
            resolvedUserId,
          );
          if (result.changes !== 1) {
            throw new Error(
              `Could not update installed ${targetEntry.entry.name}.`,
            );
          }
        }
        for (const targetEntry of changedLibraryTargets) {
          const row = db
            .prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?")
            .get(targetEntry.row.id, resolvedUserId);
          if (
            !row ||
            row.authored_audio_voice_profile !== targetEntry.authoredJson ||
            row.audio_voice_profile_override !== targetEntry.overrideJson
          ) {
            throw new Error(
              `${targetEntry.entry.name} voice sync did not persist.`,
            );
          }
          const savedAuthored = JSON.parse(row.authored_audio_voice_profile);
          const savedOverride = row.audio_voice_profile_override
            ? JSON.parse(row.audio_voice_profile_override)
            : null;
          if (
            protectedVoiceProfileHash(savedAuthored) !==
              targetEntry.authoredProtectedHash ||
            protectedVoiceProfileHash(savedOverride) !==
              targetEntry.overrideProtectedHash
          ) {
            throw new Error(
              `${targetEntry.entry.name} voice performance changed outside local identity.`,
            );
          }
          if (protectedStateHash(row) !== targetEntry.protectedStateHash) {
            throw new Error(
              `${targetEntry.entry.name} personal state changed outside voice identity.`,
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
          neutralPronouns: targets.filter((entry) => entry.plan.neutralPronouns)
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
            clearedSystemVoices: [
              targetEntry.plan.fromAuthoredSystemVoice,
              targetEntry.plan.fromOverrideSystemVoice,
            ].filter(Boolean),
            voice: targetEntry.plan.voice?.name ?? targetEntry.plan.toAuthored,
            locale: targetEntry.plan.voice?.locale ?? null,
            branchLock: targetEntry.entry.branchLock ?? null,
          })),
        },
        library: db
          ? {
              userId: resolvedUserId,
              installedMatches: installedTargets.length,
              changed: installedTargets.filter((entry) => entry.libraryChanged)
                .length,
              unchanged: installedTargets.filter(
                (entry) => !entry.libraryChanged,
              ).length,
              missing: targets.length - installedTargets.length,
              databaseBackupPath,
              bots: installedTargets
                .filter((targetEntry) => targetEntry.libraryChanged)
                .map((targetEntry) => ({
                  marketplaceName: targetEntry.entry.name,
                  installedName: targetEntry.row.name,
                  matchKind: targetEntry.matchKind,
                  changed: targetEntry.libraryChanged,
                  authored: `${targetEntry.libraryFromAuthored} → ${targetEntry.libraryToAuthored}`,
                  override:
                    targetEntry.libraryFromOverride ||
                    targetEntry.libraryToOverride
                      ? `${targetEntry.libraryFromOverride ?? "—"} → ${targetEntry.libraryToOverride ?? "—"}`
                      : null,
                  clearedSystemVoices: [
                    targetEntry.libraryFromAuthoredSystemVoice,
                    targetEntry.libraryFromOverrideSystemVoice,
                  ].filter(Boolean),
                  voice:
                    targetEntry.plan.voice?.name ?? targetEntry.plan.toAuthored,
                })),
              missingBots: targets
                .filter(
                  (targetEntry) =>
                    !installedTargets.some(
                      (installed) =>
                        installed.entry.id === targetEntry.entry.id,
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
