#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { backup, DatabaseSync } from "node:sqlite";
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
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  parseStoredBotFaceThinkingFrames,
  resolveBotFaceStyle,
} from "@localai/shared";

const root = resolve(import.meta.dirname, "..");
const manifestPath = join(
  root,
  "apps/web/public/bot-marketplace/manifest.json",
);
const marketplaceIds = new Set(["alan-watts", "carl-jung"]);

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
const approvedArchiveFields = [
  "avatarDetails",
  ...faceFieldToResolvedKey.keys(),
];
const approvedDatabaseColumns = [
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

const databaseArgument = flagValue("--db");
const userId = flagValue("--user-id");
const workspaceBackupArgument = flagValue("--workspace-backup");
const databaseBackupArgument = flagValue("--db-backup");
const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");

if (!databaseArgument || !userId || shouldApply === explicitDryRun) {
  throw new Error(
    "Usage: promote-marketplace-library-avatar-customizations.mjs --db /absolute/path/localai.db --user-id ID (--dry-run | --apply --workspace-backup /new/directory --db-backup /new/backup.db)",
  );
}
if (shouldApply && (!workspaceBackupArgument || !databaseBackupArgument)) {
  throw new Error(
    "Applying requires explicit --workspace-backup and --db-backup paths.",
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function bundlePathFor(entry) {
  return join(
    dirname(manifestPath),
    entry.bundlePath.replace(/^\/bot-marketplace\//u, ""),
  );
}

function readArchive(entry, explicitPath = null) {
  const bundlePath = explicitPath ?? bundlePathFor(entry);
  const entries = execFileSync("unzip", ["-Z1", bundlePath], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  if (!entries.includes("bot.json") || !entries.includes("memories.json")) {
    throw new Error(`${entry.name} archive is missing a required entry.`);
  }
  const document = JSON.parse(
    execFileSync("unzip", ["-p", bundlePath, "bot.json"], {
      encoding: "utf8",
    }),
  );
  if (document.botHash !== entry.botHash) {
    throw new Error(`${entry.name} bundle identity does not match the manifest.`);
  }
  if (document.bot?.name !== entry.name) {
    throw new Error(`${entry.name} bundle name does not match the manifest.`);
  }
  return {
    bundlePath,
    entries,
    document,
    archiveSha256: sha256(readFileSync(bundlePath)),
    memoriesSha256: sha256(
      execFileSync("unzip", ["-p", bundlePath, "memories.json"]),
    ),
  };
}

function libraryAvatarValues(row, label) {
  let avatarDetails = null;
  if (row.avatar_details_json) {
    try {
      avatarDetails = JSON.parse(row.avatar_details_json);
    } catch {
      throw new Error(`${label} has invalid saved Avatar Details Ink.`);
    }
  }
  if (!avatarDetails) {
    throw new Error(`${label} has no saved Avatar Details Ink to promote.`);
  }
  const faceThinkingFrames = parseStoredBotFaceThinkingFrames(
    row.face_thinking_frames,
  );
  if (!faceThinkingFrames) {
    throw new Error(`${label} has invalid saved thinking frames.`);
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
    faceThinkingFrames,
  };
}

function changedArchiveFields(bot, sourceValues) {
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

function protectedLibraryHash(row) {
  return sha256(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(row).filter(
          ([column]) =>
            !approvedDatabaseColumns.includes(column) && column !== "updated_at",
        ),
      ),
    ),
  );
}

function approvedLibraryHash(row) {
  return sha256(
    JSON.stringify(
      Object.fromEntries(
        approvedDatabaseColumns.map((column) => [column, row[column]]),
      ),
    ),
  );
}

function assertDatabaseIntegrity(database, label) {
  const integrity = database.prepare("PRAGMA integrity_check").get();
  if (integrity?.integrity_check !== "ok") {
    throw new Error(`${label} failed SQLite integrity_check.`);
  }
}

function assertArchiveMatchesSource(target, archive) {
  if (!jsonEqual(archive.entries, target.archive.entries)) {
    throw new Error(`${target.entry.name} archive entries changed.`);
  }
  if (archive.memoriesSha256 !== target.archive.memoriesSha256) {
    throw new Error(`${target.entry.name} memories changed during promotion.`);
  }
  if (protectedBotHash(archive.document.bot) !== target.protectedBotHash) {
    throw new Error(`${target.entry.name} protected portable fields changed.`);
  }
  const remaining = changedArchiveFields(
    archive.document.bot,
    target.sourceValues,
  );
  if (remaining.length > 0) {
    throw new Error(
      `${target.entry.name} still differs from the saved design: ${remaining.join(", ")}.`,
    );
  }
}

function rebuildArchive(target, outputPath, revision) {
  const scratch = mkdtempSync(join(tmpdir(), "prism-library-avatar-stage-"));
  try {
    execFileSync("unzip", ["-qq", target.archive.bundlePath, "-d", scratch]);
    const botJsonPath = join(scratch, "bot.json");
    const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
    for (const field of target.changedArchiveFields) {
      document.bot[field] = target.sourceValues[field];
    }
    document.exportedAt = revision;
    writeFileSync(botJsonPath, `${JSON.stringify(document, null, 2)}\n`);
    execFileSync("zip", ["-X", "-q", outputPath, ...target.archive.entries], {
      cwd: scratch,
    });
    assertArchiveMatchesSource(target, readArchive(target.entry, outputPath));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const targetEntries = manifest.bots.filter((entry) =>
  marketplaceIds.has(entry.id),
);
if (targetEntries.length !== marketplaceIds.size) {
  throw new Error("Alan Watts or Carl Jung is missing from the Marketplace.");
}

const databasePath = resolve(databaseArgument);
const db = new DatabaseSync(databasePath, { readOnly: !shouldApply });
let transactionOpen = false;
let stagedDirectory = null;
let workspaceFilesApplied = false;
let workspaceBackupPath = null;
let databaseBackupPath = null;

try {
  const user = db
    .prepare("SELECT id, display_name FROM users WHERE id = ?")
    .get(userId);
  if (!user) throw new Error(`Library user does not exist: ${userId}`);

  const targets = [];
  const missing = [];
  for (const entry of targetEntries) {
    const rows = db
      .prepare("SELECT * FROM bots WHERE user_id = ? AND export_hash = ?")
      .all(userId, entry.botHash);
    if (rows.length > 1) {
      throw new Error(
        `Found duplicate installed rows for Marketplace bot ${entry.name}.`,
      );
    }
    if (rows.length === 0) {
      missing.push(entry.name);
      continue;
    }
    const row = rows[0];
    const archive = readArchive(entry);
    const sourceValues = libraryAvatarValues(row, entry.name);
    targets.push({
      entry,
      row,
      archive,
      sourceValues,
      changedArchiveFields: changedArchiveFields(
        archive.document.bot,
        sourceValues,
      ),
      protectedBotHash: protectedBotHash(archive.document.bot),
      protectedLibraryHash: protectedLibraryHash(row),
      approvedLibraryHash: approvedLibraryHash(row),
    });
  }

  const changedArchives = targets.filter(
    (target) => target.changedArchiveFields.length > 0,
  );
  let backupDatabaseIntegrity = null;
  let liveDatabaseIntegrity = null;
  let protectedLibraryStatePreserved = null;

  if (shouldApply) {
    if (missing.length > 0 || targets.length !== targetEntries.length) {
      throw new Error(
        `Cannot apply without both saved Library sources: ${missing.join(", ")}.`,
      );
    }
    workspaceBackupPath = resolve(workspaceBackupArgument);
    databaseBackupPath = resolve(databaseBackupArgument);
    if (existsSync(workspaceBackupPath)) {
      throw new Error(
        `Refusing to overwrite workspace backup: ${workspaceBackupPath}`,
      );
    }
    if (existsSync(databaseBackupPath)) {
      throw new Error(
        `Refusing to overwrite database backup: ${databaseBackupPath}`,
      );
    }
    if (databaseBackupPath === databasePath) {
      throw new Error("The database backup must differ from the live database.");
    }

    mkdirSync(workspaceBackupPath, { recursive: true });
    copyFileSync(manifestPath, join(workspaceBackupPath, "manifest.json"));
    for (const target of targets) {
      copyFileSync(
        target.archive.bundlePath,
        join(workspaceBackupPath, basename(target.archive.bundlePath)),
      );
    }
    writeFileSync(
      join(workspaceBackupPath, "audit.json"),
      `${JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          sourceDatabase: databasePath,
          user: { id: user.id, displayName: user.display_name },
          manifestSha256: sha256(readFileSync(manifestPath)),
          bundles: targets.map((target) => ({
            id: target.entry.id,
            name: target.entry.name,
            botHash: target.entry.botHash,
            archiveEntries: target.archive.entries,
            sha256: target.archive.archiveSha256,
            memoriesSha256: target.archive.memoriesSha256,
            changedArchiveFields: target.changedArchiveFields,
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
      backupDatabaseIntegrity = "ok";
    } finally {
      backupDb.close();
    }

    const revision = new Date().toISOString();
    stagedDirectory = mkdtempSync(
      join(tmpdir(), "prism-library-avatar-promotion-"),
    );
    for (const target of changedArchives) {
      rebuildArchive(
        target,
        join(stagedDirectory, basename(target.archive.bundlePath)),
        revision,
      );
    }

    db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    for (const target of targets) {
      const current = db
        .prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?")
        .get(target.row.id, userId);
      if (!current) {
        throw new Error(`Installed ${target.entry.name} disappeared.`);
      }
      if (approvedLibraryHash(current) !== target.approvedLibraryHash) {
        throw new Error(
          `${target.entry.name} saved face or Ink changed after the dry run.`,
        );
      }
      if (protectedLibraryHash(current) !== target.protectedLibraryHash) {
        throw new Error(
          `${target.entry.name} protected Library state changed after the dry run.`,
        );
      }
    }

    for (const target of changedArchives) {
      renameSync(
        join(stagedDirectory, basename(target.archive.bundlePath)),
        target.archive.bundlePath,
      );
      workspaceFilesApplied = true;
    }
    if (changedArchives.length > 0) {
      manifest.updatedAt = revision;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }

    for (const target of targets) {
      assertArchiveMatchesSource(target, readArchive(target.entry));
      const current = db
        .prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?")
        .get(target.row.id, userId);
      if (
        !current ||
        approvedLibraryHash(current) !== target.approvedLibraryHash ||
        protectedLibraryHash(current) !== target.protectedLibraryHash
      ) {
        throw new Error(
          `${target.entry.name} Library state changed during promotion.`,
        );
      }
    }
    protectedLibraryStatePreserved = true;
    assertDatabaseIntegrity(db, "Live database");
    liveDatabaseIntegrity = "ok";
    db.exec("COMMIT");
    transactionOpen = false;
  }

  console.log(
    JSON.stringify(
      {
        mode: shouldApply ? "apply" : "dry-run",
        libraryUser: { id: user.id, displayName: user.display_name },
        marketplaceTargets: targetEntries.length,
        changedMarketplaceBots: changedArchives.length,
        installedMatches: targets.length,
        changedInstalledBots: 0,
        missingInstalledBots: missing,
        libraryIsDesignSource: true,
        protectedLibraryStatePreserved,
        backupDatabaseIntegrity,
        liveDatabaseIntegrity,
        workspaceBackupPath,
        databaseBackupPath,
        bots: targets.map((target) => ({
          marketplaceId: target.entry.id,
          marketplaceName: target.entry.name,
          installedName: target.row.name,
          botHash: target.entry.botHash,
          archiveEntries: target.archive.entries,
          changedArchiveFields: target.changedArchiveFields,
          avatarDetailsInkAlreadyMatched: !target.changedArchiveFields.includes(
            "avatarDetails",
          ),
        })),
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (transactionOpen) db.exec("ROLLBACK");
  if (workspaceFilesApplied && workspaceBackupPath) {
    copyFileSync(join(workspaceBackupPath, "manifest.json"), manifestPath);
    for (const entry of targetEntries) {
      copyFileSync(
        join(workspaceBackupPath, basename(bundlePathFor(entry))),
        bundlePathFor(entry),
      );
    }
  }
  throw error;
} finally {
  if (stagedDirectory) {
    rmSync(stagedDirectory, { recursive: true, force: true });
  }
  db.close();
}
