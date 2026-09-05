#!/usr/bin/env node
/**
 * Activate and regionally refine the provider-neutral Accent Map for one
 * user's complete Library without changing voice identity, performance,
 * persona, or Avatar SFX data.
 *
 * Usage:
 *   node --experimental-strip-types scripts/recast-library-accent-map.mjs \
 *     --dry-run --db PATH --user-id ID --expected-count 119 --ledger PATH
 *
 *   node --experimental-strip-types scripts/recast-library-accent-map.mjs \
 *     --apply --db PATH --user-id ID --expected-count 119 \
 *     --backup PATH --ledger PATH
 *
 *   node --experimental-strip-types scripts/recast-library-accent-map.mjs \
 *     --verify --db PATH --user-id ID --expected-count 119 \
 *     --backup PATH --ledger PATH
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import {
  normalizeBotAudioVoiceProfileV1,
  resolveBotAudioVoiceProfileV1,
  voiceAccentDefinitionForId,
  voiceAccentMapPointForCoordinates,
} from "@localai/shared";

const desktopDbDefault =
  "/Users/jared/Library/Application Support/com.localai.prism-desktop/localai.db";

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableJson(nested)]),
  );
}

function digest(value) {
  return sha256(JSON.stringify(stableJson(value)));
}

function parseJsonObject(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is missing.`);
  }
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

function clone(value) {
  return structuredClone(value);
}

function authoredNonAccentProjection(profile) {
  const projected = clone(profile);
  if (projected.local && typeof projected.local === "object") {
    delete projected.local.pronunciation;
    delete projected.local.speechprint;
  }
  return projected;
}

function overrideNonAccentProjection(profile) {
  if (!profile) return null;
  const projected = clone(profile);
  if (projected.v === 3 && projected.local && typeof projected.local === "object") {
    delete projected.local.pronunciation;
    delete projected.local.speechprint;
    return projected;
  }
  for (const key of [
    "pronunciationBase",
    "accentDefinitionId",
    "pronunciationMapPoint",
    "speechprintInfluence",
    "speechprintStrength",
    "speechprintVariationSeed",
  ]) {
    delete projected[key];
  }
  return projected;
}

function nearlyEqual(left, right) {
  return Math.abs(left - right) < 1e-12;
}

function samePoint(left, right) {
  return Boolean(
    left &&
      right &&
      nearlyEqual(left.x, right.x) &&
      nearlyEqual(left.y, right.y),
  );
}

function cast(id, name, accentDefinitionId, longitude, latitude, rationale) {
  return {
    id,
    name,
    accentDefinitionId,
    point: voiceAccentMapPointForCoordinates(longitude, latitude),
    rationale,
  };
}

// These are intentionally conservative. Biographical/canonical geography or
// an existing authored performance direction supplies the location. Every
// other bot retains its existing authored pin.
const REGIONAL_CASTS = [
  cast("4184d8412965ca2353098708", "Abraham Lincoln", "inland-north-english", -89.65, 39.78, "Springfield, Illinois voice direction"),
  cast("db55e02fed44740f636a9544", "Adolf Hitler", "bavarian-german-influenced-english", 16.37, 48.21, "Austrian German origin"),
  cast("7a550356e8002af76bcb39d1", "Alan Watts", "modern-rp-english", -0.13, 51.51, "London-born British broadcaster"),
  cast("103ae259ed0cf0eea10dced8", "Albert Einstein", "bavarian-german-influenced-english", 9.99, 48.4, "Ulm, southern Germany"),
  cast("f468d7cce0b66136b59f54d7", "Barack Obama", "inland-north-english", -87.63, 41.88, "Chicago cadence in authored direction"),
  cast("cab2832741cbe60c8a437998", "Bob Ross", "north-florida-english", -81.02, 29.21, "Florida upbringing"),
  cast("ca977bd81f8b8b58db2fbfe5", "Brash Brian", "texas-english", -97.74, 30.27, "Distinct brash regional character casting"),
  cast("b59c3d00024236f6f75517b3", "Brian Griffin", "eastern-new-england-english", -71.41, 41.82, "Canonical Rhode Island setting"),
  cast("83487c297d72e7cf43f29bf6", "Buckethead", "southern-california-english", -117.75, 34.06, "Pomona, California origin"),
  cast("3c53b30b159f0a10d566724f", "Carl Jung", "german-influenced-english", 8.54, 47.38, "Swiss German identity near Zurich"),
  cast("45479e8f35dcbd8301f34089", "Carl von Clausewitz", "northern-german-influenced-english", 11.63, 52.12, "Prussian origin near Magdeburg"),
  cast("1378aa927ad1100977883f26", "Charles Darwin", "modern-rp-english", 0.12, 52.21, "Cambridge-centered learned English casting"),
  cast("dcf8d2e169b1bc3362874d7c", "Claude Monet", "parisian-french-influenced-english", 2.35, 48.86, "Paris-born French identity"),
  cast("93ac7bcb53659a8c874e912c", "Confusion Collin", "estuary-english", -0.13, 51.51, "Distinct London-region character casting"),
  cast("85937896439e73fa179d780c", "Dante Alighieri", "northern-italian-influenced-english", 11.26, 43.77, "Florentine identity"),
  cast("4b3f161e85c9fe77c2ab7b19", "Edgar Allan Poe", "american-english", -76.61, 39.29, "Baltimore literary identity without false dialect precision"),
  cast("ebb685a6162e43d0088da29a", "Fibbing Phil", "cockney-english", -0.13, 51.51, "Distinct sly London character casting"),
  cast("ea6be6fb3bfab2f7b49782b7", "Forgetful Forrest", "appalachian-english", -82.55, 35.6, "Distinct friendly Southern character casting"),
  cast("be38b3161bec825ecc411487", "Frederick Douglass", "southern-us-english", -76.07, 38.77, "Eastern Shore of Maryland origin"),
  cast("01b7076e131098833d2e1397", "Friedrich Nietzsche", "northern-german-influenced-english", 12.12, 51.24, "Saxon-Prussian origin"),
  cast("5895bb181de4aecb26f73d9a", "Gavin Newsom", "bay-area-english", -122.42, 37.77, "San Francisco identity"),
  cast("ef65e06aa9fcef026e6003dd", "George Washington", "southern-us-english", -77.09, 38.71, "Virginia identity"),
  cast("5607a8affabe9f33bf68f613", "Georgia O'Keeffe", "american-english", -105.94, 35.69, "New Mexico artistic identity without false dialect precision"),
  cast("9baea2804073c054b8fb1743", "Hagrid", "british-english", -2.24, 51.86, "West Country direction near Gloucestershire"),
  cast("5b9e6381a347cc25af613fdd", "Harriet Tubman", "southern-us-english", -76.08, 38.5, "Eastern Shore of Maryland origin"),
  cast("9f72232bcfb694678589f927", "Harry Potter", "modern-rp-english", -0.13, 51.51, "Contemporary southern British casting"),
  cast("02d1e88fd30a128144b17cbf", "Isaac Newton", "modern-rp-english", 0.12, 52.21, "Cambridge-centered learned English casting"),
  cast("72ea193ff225b50b848f23c2", "James Madison", "southern-us-english", -78.16, 38.22, "Virginia identity"),
  cast("dfe0ab62c8831588570e9a8c", "Jane Austen", "modern-rp-english", -1.4, 51.0, "Hampshire identity with restrained prestige casting"),
  cast("af884ca36603660205e2de50", "John Adams", "eastern-new-england-english", -71.0, 42.21, "Massachusetts identity"),
  cast("8eb601bf97bdfb5db929155f", "Joseph Campbell", "new-york-english", -74.01, 40.71, "New York City identity"),
  cast("2e28b0fcf3d5c2bf3b93c70b", "Joseph Smith Jr.", "american-english", -77.23, 43.06, "Upstate New York ministry without urban dialect"),
  cast("be5c96e6a3a36239096f79fc", "Khloé Kardashian", "southern-california-english", -118.24, 34.05, "Los Angeles identity"),
  cast("e317abf409c1b57193a57d04", "Kim Kardashian", "southern-california-english", -118.24, 34.05, "Los Angeles identity"),
  cast("b935ff2e7016f4a14c11fac6", "Kourtney Kardashian Barker", "southern-california-english", -118.24, 34.05, "Los Angeles identity"),
  cast("9d11efc03a2b537c5e92e14e", "Kris Jenner", "southern-california-english", -118.24, 34.05, "Los Angeles identity"),
  cast("0f8b5befe53d2e9b8677a229", "L", "modern-rp-english", -1.31, 51.06, "Canonical English upbringing"),
  cast("e7a4ecc5246dafd9446732b9", "Lazy Lauren", "north-florida-english", -84.28, 30.44, "Distinct sleepy regional drawl casting"),
  cast("001ddb70f18b6a51c6a68164", "Leonardo da Vinci", "northern-italian-influenced-english", 11.26, 43.77, "Tuscan identity"),
  cast("95d0ebb4a57c3c5100ca34dc", "Lois Griffin", "eastern-new-england-english", -71.41, 41.82, "Canonical Rhode Island setting"),
  cast("ec2ffe343bdb8f71e2e69d9a", "Marcus Aurelius", "southern-italian-influenced-english", 12.5, 41.9, "Roman identity"),
  cast("2b69e5c14d7e1fe66cd6e552", "Marie Antoinette", "french-influenced-english", 2.13, 48.8, "Versailles court identity while retaining Austrian-French breadth"),
  cast("480fc95f379833ef0c8ec344", "Mary Shelley", "modern-rp-english", -0.13, 51.51, "London identity"),
  cast("4687afb1e5f4558e8e8d471b", "Maximilien Robespierre", "parisian-french-influenced-english", 2.35, 48.86, "Paris revolutionary identity"),
  cast("d0a96e0e7b45a3dbf4352459", "Meg Griffin", "eastern-new-england-english", -71.41, 41.82, "Canonical Rhode Island setting"),
  cast("83a1637a5cb09751269695ee", "Mr. Krabs", "eastern-new-england-english", -71.06, 42.36, "Authored nautical New England character casting"),
  cast("05d25216a007518cb1484667", "Mr. Rogers", "american-english", -79.99, 40.44, "Pittsburgh identity without false dialect precision"),
  cast("6d07fe5eef4a45341cf3f5ad", "Near", "modern-rp-english", -1.31, 51.06, "Canonical English upbringing"),
  cast("7a69282f8eccd2085b7efeb7", "Niccolò Machiavelli", "northern-italian-influenced-english", 11.26, 43.77, "Florentine identity"),
  cast("02c515636a5a299bc6dff551", "Nonsense Nora", "cockney-english", -0.13, 51.51, "Authored working-class London character casting"),
  cast("b28d7894aad6a1c0ce5eb660", "Obi-Wan Kenobi", "modern-rp-english", -0.13, 51.51, "Measured prestige-English performance casting"),
  cast("10427e0614aa2067433aac6e", "Peter Griffin", "eastern-new-england-english", -71.41, 41.82, "Authored New England direction and Rhode Island setting"),
  cast("2072530d9fe5c05f8b1ec5c4", "Pia", "estuary-english", -0.13, 51.51, "Distinct buoyant London-region character casting"),
  cast("36788b1e9f60c7fb9ccf8bae", "Richard Dawkins", "modern-rp-english", -1.26, 51.75, "Oxford academic identity"),
  cast("dbff835fd6574de2c314fb7a", "Sad Sally", "essex-english", 0.47, 51.73, "Authored nasal, impatient southeast-English casting"),
  cast("21c939d61eaa77566b0f9828", "Sam Harris", "southern-california-english", -118.24, 34.05, "Los Angeles identity"),
  cast("7afd44d4c02e3651f515b08d", "Sassy Sarah", "texas-english", -97.74, 30.27, "Distinct forceful Southern character casting"),
  cast("ffbd076d099a34c78a2ecbca", "Sigmund Freud", "bavarian-german-influenced-english", 16.37, 48.21, "Viennese identity"),
  cast("ecfc19c0034e5faf1852f3d0", "Silent Simon", "modern-rp-english", -0.13, 51.51, "Distinct restrained prestige-English casting"),
  cast("3878ad77e7388adaa925fb1d", "Stewie Griffin", "modern-rp-english", -0.13, 51.51, "Authored prestige-English performance"),
  cast("1d67a141fa03499b1be3d19b", "Thomas Hobbes", "modern-rp-english", -1.26, 51.75, "English philosophical authority casting"),
  cast("bf0eb470960b320a08bd61ae", "Thomas Jefferson", "southern-us-english", -78.48, 38.03, "Authored Virginia identity"),
  cast("cb4d415be94b7d7763bef2ac", "Tiny Tina", "appalachian-english", -82.55, 35.6, "Distinct bright Southern character casting"),
  cast("3b673dbf3f8c9ec1cedfdf9b", "Salvador Dalí", "spanish-influenced-english", 2.96, 42.27, "Catalan identity without false Andalusian precision"),
  cast("28426134bed74c045f05a9fd", "Vincent van Gogh", "dutch-influenced-english", 4.66, 51.47, "Dutch origin near Zundert"),
  cast("6b04d246dca60b755361f4ee", "William Shakespeare", "british-english", -1.71, 52.19, "Stratford identity without anachronistic modern dialect"),
];

const castsById = new Map(REGIONAL_CASTS.map((entry) => [entry.id, entry]));
if (castsById.size !== REGIONAL_CASTS.length) {
  throw new Error("Regional casting list contains duplicate bot IDs.");
}

function assertDatabaseIntegrity(db, label) {
  const result = db.prepare("PRAGMA integrity_check").get();
  if (!result || Object.values(result)[0] !== "ok") {
    throw new Error(
      `${label} failed PRAGMA integrity_check: ${JSON.stringify(result)}`,
    );
  }
}

function profileTarget(row, authored) {
  if (authored.v !== 3 || !authored.local?.pronunciation || !authored.local?.speechprint) {
    throw new Error(`${row.name} (${row.id}) does not have the expected V3 authored profile.`);
  }
  const existing = {
    pronunciationBase: authored.local.pronunciation.base,
    accentDefinitionId: authored.local.pronunciation.accentDefinitionId,
    pronunciationMapPoint: authored.local.pronunciation.mapPoint,
    speechprintInfluence: authored.local.speechprint.influence,
    speechprintStrength: authored.local.speechprint.strength,
    speechprintVariationSeed: authored.local.speechprint.variationSeed,
  };
  if (!existing.accentDefinitionId || !existing.pronunciationMapPoint) {
    throw new Error(`${row.name} (${row.id}) is missing its authored Accent Map identity.`);
  }

  const regional = castsById.get(row.id);
  if (!regional) return { ...existing, regional: null };
  if (regional.name !== row.name) {
    throw new Error(`Casting ID ${row.id} expected ${regional.name}, found ${row.name}.`);
  }
  const definition = voiceAccentDefinitionForId(regional.accentDefinitionId);
  if (!definition) {
    throw new Error(`${row.name} has unsupported accent ${regional.accentDefinitionId}.`);
  }
  return {
    ...existing,
    accentDefinitionId: definition.id,
    pronunciationMapPoint: regional.point,
    speechprintInfluence: definition.localSpeechprintFallback,
    regional,
  };
}

function patchAuthored(profile, target) {
  const patched = clone(profile);
  patched.local.pronunciation.base = target.pronunciationBase;
  patched.local.pronunciation.accentDefinitionId = target.accentDefinitionId;
  patched.local.pronunciation.mapPoint = target.pronunciationMapPoint;
  patched.local.speechprint.influence = target.speechprintInfluence;
  patched.local.speechprint.strength = target.speechprintStrength;
  patched.local.speechprint.variationSeed = target.speechprintVariationSeed;
  return patched;
}

function patchOverride(profile, target) {
  if (!profile) return null;
  if (profile.v === 3) {
    if (!profile.local?.pronunciation || !profile.local?.speechprint) {
      throw new Error("V3 override is missing its local pronunciation profile.");
    }
    const patched = clone(profile);
    patched.local.pronunciation.base = target.pronunciationBase;
    patched.local.pronunciation.accentDefinitionId = target.accentDefinitionId;
    patched.local.pronunciation.mapPoint = target.pronunciationMapPoint;
    patched.local.speechprint.influence = target.speechprintInfluence;
    patched.local.speechprint.strength = target.speechprintStrength;
    patched.local.speechprint.variationSeed = target.speechprintVariationSeed;
    return patched;
  }
  return {
    ...profile,
    pronunciationBase: target.pronunciationBase,
    accentDefinitionId: target.accentDefinitionId,
    pronunciationMapPoint: target.pronunciationMapPoint,
    speechprintInfluence: target.speechprintInfluence,
    speechprintStrength: target.speechprintStrength,
    speechprintVariationSeed: target.speechprintVariationSeed,
  };
}

function assertEffectiveTarget(entry) {
  const effective = resolveBotAudioVoiceProfileV1(entry.authoredAfter, entry.overrideAfter);
  if (
    effective.pronunciationBase !== entry.target.pronunciationBase ||
    effective.accentDefinitionId !== entry.target.accentDefinitionId ||
    effective.speechprintInfluence !== entry.target.speechprintInfluence ||
    effective.speechprintStrength !== entry.target.speechprintStrength ||
    effective.speechprintVariationSeed !== entry.target.speechprintVariationSeed ||
    !samePoint(effective.pronunciationMapPoint, entry.target.pronunciationMapPoint)
  ) {
    throw new Error(
      `${entry.name} did not resolve to its target Accent Map identity: ${JSON.stringify({
        effective: {
          pronunciationBase: effective.pronunciationBase,
          accentDefinitionId: effective.accentDefinitionId,
          pronunciationMapPoint: effective.pronunciationMapPoint,
          speechprintInfluence: effective.speechprintInfluence,
          speechprintStrength: effective.speechprintStrength,
          speechprintVariationSeed: effective.speechprintVariationSeed,
        },
        target: entry.target,
      })}`,
    );
  }
}

const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");
const verify = process.argv.includes("--verify");
if ([dryRun, apply, verify].filter(Boolean).length !== 1) {
  throw new Error("Choose exactly one of --dry-run, --apply, or --verify.");
}

const databasePath = resolve(argumentValue("--db") ?? desktopDbDefault);
const requestedUserId = argumentValue("--user-id");
const expectedCount = Number(argumentValue("--expected-count") ?? "0");
const backupArgument = argumentValue("--backup");
const ledgerArgument = argumentValue("--ledger");

if (!requestedUserId) throw new Error("--user-id is required.");
if (!Number.isSafeInteger(expectedCount) || expectedCount <= 0) {
  throw new Error("--expected-count must be a positive integer.");
}
if ((apply || verify) && !backupArgument) {
  throw new Error("--backup is required with --apply or --verify.");
}
if (apply && existsSync(resolve(backupArgument))) {
  throw new Error(`Refusing to overwrite backup: ${backupArgument}`);
}
if ((apply || verify) && resolve(backupArgument) === databasePath) {
  throw new Error("The backup must differ from the live database.");
}
if (verify && !existsSync(resolve(backupArgument))) {
  throw new Error(`Backup does not exist: ${backupArgument}`);
}

const db = new DatabaseSync(databasePath, { readOnly: !apply });
try {
  assertDatabaseIntegrity(db, "Live database before migration");
  const owner = db
    .prepare("SELECT id, email, display_name FROM users WHERE id = ?")
    .get(requestedUserId);
  if (!owner) throw new Error(`User ${requestedUserId} was not found.`);

  const rows = db
    .prepare(`
      SELECT id, name, authored_audio_voice_profile, audio_voice_profile_override
      FROM bots
      WHERE user_id = ?
      ORDER BY lower(name), id
    `)
    .all(requestedUserId);
  if (rows.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} Library bots; found ${rows.length}.`);
  }

  const rowIds = new Set(rows.map((row) => row.id));
  const missingCastIds = REGIONAL_CASTS.filter((entry) => !rowIds.has(entry.id));
  if (missingCastIds.length > 0) {
    throw new Error(
      `Regional casting targets are missing: ${missingCastIds.map((entry) => entry.name).join(", ")}`,
    );
  }

  const entries = rows.map((row) => {
    const authoredBefore = parseJsonObject(
      row.authored_audio_voice_profile,
      `${row.name} authored profile`,
    );
    const overrideBefore = row.audio_voice_profile_override
      ? parseJsonObject(row.audio_voice_profile_override, `${row.name} override`)
      : null;
    const target = profileTarget(row, authoredBefore);
    const authoredAfter = patchAuthored(authoredBefore, target);
    const overrideAfter = patchOverride(overrideBefore, target);

    if (
      digest(authoredNonAccentProjection(authoredBefore)) !==
      digest(authoredNonAccentProjection(authoredAfter))
    ) {
      throw new Error(`${row.name} authored non-accent payload changed.`);
    }
    if (
      digest(overrideNonAccentProjection(overrideBefore)) !==
      digest(overrideNonAccentProjection(overrideAfter))
    ) {
      throw new Error(`${row.name} override non-accent payload changed.`);
    }

    const entry = {
      id: row.id,
      name: row.name,
      authoredBefore,
      overrideBefore,
      authoredAfter,
      overrideAfter,
      target,
    };
    assertEffectiveTarget(entry);
    return entry;
  });

  const normalizedEffectiveProfiles = entries.map((entry) =>
    normalizeBotAudioVoiceProfileV1(
      resolveBotAudioVoiceProfileV1(entry.authoredAfter, entry.overrideAfter),
    ),
  );
  if (normalizedEffectiveProfiles.length !== expectedCount) {
    throw new Error("Effective profile normalization did not cover the complete Library.");
  }

  const accentDistribution = Object.fromEntries(
    [...entries.reduce((counts, entry) => {
      const id = entry.target.accentDefinitionId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      return counts;
    }, new Map())].sort(([left], [right]) => left.localeCompare(right)),
  );
  const summary = {
    owner: {
      id: owner.id,
      email: owner.email,
      displayName: owner.display_name,
    },
    botsAudited: entries.length,
    rowsUpdated: entries.length,
    overridesActivated: entries.filter((entry) => entry.overrideBefore).length,
    regionallyRefined: entries.filter((entry) => entry.target.regional).length,
    existingPinsRetained: entries.filter((entry) => !entry.target.regional).length,
    accentDistribution,
    audioSamplesPlayed: false,
  };

  if (verify) {
    const backupDb = new DatabaseSync(resolve(backupArgument), {
      readOnly: true,
    });
    try {
      const backupRows = backupDb
        .prepare(`
          SELECT id, authored_audio_voice_profile, audio_voice_profile_override
          FROM bots WHERE user_id = ?
        `)
        .all(requestedUserId);
      if (backupRows.length !== expectedCount) {
        throw new Error(
          `Expected ${expectedCount} backup Library bots; found ${backupRows.length}.`,
        );
      }
      const backupById = new Map(backupRows.map((row) => [row.id, row]));
      for (const entry of entries) {
        const backupRow = backupById.get(entry.id);
        if (!backupRow) {
          throw new Error(`${entry.name} is missing from the recovery snapshot.`);
        }
        const backupAuthored = parseJsonObject(
          backupRow.authored_audio_voice_profile,
          `${entry.name} backup authored profile`,
        );
        const backupOverride = backupRow.audio_voice_profile_override
          ? parseJsonObject(
              backupRow.audio_voice_profile_override,
              `${entry.name} backup override`,
            )
          : null;
        if (
          digest(authoredNonAccentProjection(backupAuthored)) !==
          digest(authoredNonAccentProjection(entry.authoredBefore))
        ) {
          throw new Error(
            `${entry.name} authored non-accent payload differs from the recovery snapshot.`,
          );
        }
        if (
          digest(overrideNonAccentProjection(backupOverride)) !==
          digest(overrideNonAccentProjection(entry.overrideBefore))
        ) {
          throw new Error(
            `${entry.name} override non-accent payload differs from the recovery snapshot.`,
          );
        }
      }
    } finally {
      backupDb.close();
    }
    summary.recoverySnapshotCompared = true;
    summary.nonAccentPayloadsPreserved = true;
  }

  if (apply) {
    const backupPath = resolve(backupArgument);
    mkdirSync(dirname(backupPath), { recursive: true });
    await backup(db, backupPath);
    const backupDb = new DatabaseSync(backupPath, { readOnly: true });
    try {
      assertDatabaseIntegrity(backupDb, "Backup database");
    } finally {
      backupDb.close();
    }

    const updatedAt = new Date().toISOString();
    const update = db.prepare(`
      UPDATE bots
      SET authored_audio_voice_profile = ?,
          audio_voice_profile_override = ?,
          updated_at = ?
      WHERE id = ? AND user_id = ?
    `);
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const entry of entries) {
        const result = update.run(
          JSON.stringify(entry.authoredAfter),
          entry.overrideAfter ? JSON.stringify(entry.overrideAfter) : null,
          updatedAt,
          entry.id,
          requestedUserId,
        );
        if (result.changes !== 1) {
          throw new Error(`${entry.name} updated ${result.changes} rows instead of one.`);
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    assertDatabaseIntegrity(db, "Live database after migration");

    const verifyRows = db
      .prepare(`
        SELECT id, authored_audio_voice_profile, audio_voice_profile_override
        FROM bots WHERE user_id = ?
      `)
      .all(requestedUserId);
    const verifyById = new Map(verifyRows.map((row) => [row.id, row]));
    for (const entry of entries) {
      const row = verifyById.get(entry.id);
      if (!row) throw new Error(`${entry.name} vanished during post-write verification.`);
      const persistedAuthored = parseJsonObject(row.authored_audio_voice_profile, `${entry.name} persisted authored profile`);
      const persistedOverride = row.audio_voice_profile_override
        ? parseJsonObject(row.audio_voice_profile_override, `${entry.name} persisted override`)
        : null;
      if (digest(persistedAuthored) !== digest(entry.authoredAfter)) {
        throw new Error(`${entry.name} authored profile did not persist exactly.`);
      }
      if (digest(persistedOverride) !== digest(entry.overrideAfter)) {
        throw new Error(`${entry.name} override did not persist exactly.`);
      }
      assertEffectiveTarget({ ...entry, authoredAfter: persistedAuthored, overrideAfter: persistedOverride });
    }
  }

  const ledger = {
    createdAt: new Date().toISOString(),
    mode: apply ? "apply" : verify ? "verify" : "dry-run",
    database: databasePath,
    backup: apply || verify ? resolve(backupArgument) : null,
    summary,
    bots: entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      previousAccentDefinitionId:
        entry.authoredBefore.local.pronunciation.accentDefinitionId,
      accentDefinitionId: entry.target.accentDefinitionId,
      mapPoint: entry.target.pronunciationMapPoint,
      regionallyRefined: Boolean(entry.target.regional),
      rationale:
        entry.target.regional?.rationale ?? "Existing authored Accent Map pin retained",
      overrideActivated: Boolean(entry.overrideBefore),
      authoredNonAccentDigest: digest(
        authoredNonAccentProjection(entry.authoredAfter),
      ),
      overrideNonAccentDigest: digest(
        overrideNonAccentProjection(entry.overrideAfter),
      ),
    })),
  };

  if (ledgerArgument) {
    const ledgerPath = resolve(ledgerArgument);
    mkdirSync(dirname(ledgerPath), { recursive: true });
    writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  }

  console.log(JSON.stringify({ mode: ledger.mode, ...summary }, null, 2));
} finally {
  db.close();
}
