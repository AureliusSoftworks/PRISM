#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import {
  DEFAULT_BOT_FACE_BLINK_BAR,
  DEFAULT_BOT_FACE_BLINK_OFFSET_X,
  DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
  DEFAULT_BOT_FACE_BLINK_SCALE,
  DEFAULT_BOT_FACE_EYE_COUNT,
  DEFAULT_BOT_FACE_GLYPH_ANIMATION,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceBlinkOffsetX,
  normalizeBotFaceBlinkOffsetY,
  normalizeBotFaceBlinkScale,
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeCount,
  normalizeBotFaceEyeOffsetX,
  normalizeBotFaceEyeOffsetY,
  normalizeBotFaceEyeRotationDeg,
  normalizeBotFaceEyeScale,
  normalizeBotFaceFontId,
  normalizeBotFaceFontWeight,
  normalizeBotFaceGlyphAnimation,
  normalizeBotFaceMouthCharacter,
  normalizeBotFaceMouthOffsetX,
  normalizeBotFaceMouthOffsetY,
  normalizeBotFaceMouthRotationDeg,
  normalizeBotFaceMouthScale,
  serializeBotFaceThinkingFrames,
} from "@localai/shared";

const root = resolve(import.meta.dirname, "..");
const manifestPath = join(
  root,
  "apps/web/public/bot-marketplace/manifest.json",
);
const tallEyeGlyphs = new Set(["=", "≈"]);
const additionallyPromotedMarketplaceIds = new Set(["carl-jung"]);
const syncColumns = [
  "avatar_details_json",
  "face_eyes_font",
  "face_eye_character",
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
  "face_eye_count",
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
const backupArgument = flagValue("--backup");
const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");

if (!databaseArgument || !userId) {
  throw new Error(
    "Usage: sync-marketplace-avatar-faces-to-library.mjs --db /absolute/path/localai.db --user-id ID [--dry-run | --apply --backup /absolute/path/backup.db]",
  );
}
if (shouldApply && explicitDryRun) {
  throw new Error("Choose either --dry-run or --apply, not both.");
}
if (shouldApply && !backupArgument) {
  throw new Error("Applying a library sync requires --backup /absolute/path/backup.db.");
}

function parseBundle(entry) {
  const bundlePath = join(
    dirname(manifestPath),
    entry.bundlePath.replace(/^\/bot-marketplace\//u, ""),
  );
  const document = JSON.parse(
    execFileSync("unzip", ["-p", bundlePath, "bot.json"], {
      encoding: "utf8",
    }),
  );
  if (document.botHash !== entry.botHash) {
    throw new Error(`${entry.name} bundle identity does not match its manifest entry.`);
  }
  if (document.bot?.name !== entry.name) {
    throw new Error(`${entry.name} bundle name does not match its manifest entry.`);
  }
  return document.bot;
}

function normalizedRequiredFont(value, label) {
  const normalized = normalizeBotFaceFontId(value);
  if (!normalized) throw new Error(`${label} is missing a valid face font.`);
  return normalized;
}

function normalizedRequiredWeight(value, label) {
  const normalized = normalizeBotFaceFontWeight(value);
  if (normalized === null) throw new Error(`${label} is missing a valid face weight.`);
  return normalized;
}

function libraryFaceValues(bot, label) {
  return {
    avatar_details_json:
      bot.avatarDetails === undefined || bot.avatarDetails === null
        ? null
        : JSON.stringify(bot.avatarDetails),
    face_eyes_font: normalizedRequiredFont(bot.faceEyesFont, label),
    face_eye_character: normalizeBotFaceEyeCharacter(bot.faceEyeCharacter),
    face_eye_animation:
      normalizeBotFaceGlyphAnimation(bot.faceEyeAnimation) ??
      DEFAULT_BOT_FACE_GLYPH_ANIMATION,
    face_mouth_font: normalizedRequiredFont(bot.faceMouthFont, label),
    face_mouth_character: normalizeBotFaceMouthCharacter(
      bot.faceMouthCharacter,
    ),
    face_mouth_animation:
      normalizeBotFaceGlyphAnimation(bot.faceMouthAnimation) ??
      DEFAULT_BOT_FACE_GLYPH_ANIMATION,
    face_mouth_coffee_pucker: bot.faceMouthCoffeePucker === true ? 1 : 0,
    face_font_weight: normalizedRequiredWeight(bot.faceFontWeight, label),
    face_eye_scale: normalizeBotFaceEyeScale(bot.faceEyeScale),
    face_eye_offset_x: normalizeBotFaceEyeOffsetX(bot.faceEyeOffsetX),
    face_eye_offset_y: normalizeBotFaceEyeOffsetY(bot.faceEyeOffsetY),
    face_eye_rotation_deg: normalizeBotFaceEyeRotationDeg(
      bot.faceEyeRotationDeg,
    ),
    face_eye_count:
      normalizeBotFaceEyeCount(bot.faceEyeCount) ??
      DEFAULT_BOT_FACE_EYE_COUNT,
    face_mouth_scale: normalizeBotFaceMouthScale(bot.faceMouthScale),
    face_mouth_offset_x: normalizeBotFaceMouthOffsetX(bot.faceMouthOffsetX),
    face_mouth_offset_y: normalizeBotFaceMouthOffsetY(bot.faceMouthOffsetY),
    face_mouth_rotation_deg: normalizeBotFaceMouthRotationDeg(
      bot.faceMouthRotationDeg,
    ),
    face_blink_bar:
      normalizeBotFaceBlinkBar(bot.faceBlinkBar) ?? DEFAULT_BOT_FACE_BLINK_BAR,
    face_blink_scale:
      normalizeBotFaceBlinkScale(bot.faceBlinkScale) ??
      DEFAULT_BOT_FACE_BLINK_SCALE,
    face_blink_offset_x:
      normalizeBotFaceBlinkOffsetX(bot.faceBlinkOffsetX) ??
      DEFAULT_BOT_FACE_BLINK_OFFSET_X,
    face_blink_offset_y:
      normalizeBotFaceBlinkOffsetY(bot.faceBlinkOffsetY) ??
      DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
    face_thinking_frames: serializeBotFaceThinkingFrames(
      bot.faceThinkingFrames,
    ),
  };
}

function changedFields(row, targetValues) {
  return syncColumns.filter((column) => row[column] !== targetValues[column]);
}

function protectedStateHash(row) {
  const protectedRow = Object.fromEntries(
    Object.entries(row).filter(
      ([column]) => !syncColumns.includes(column) && column !== "updated_at",
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

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const targets = manifest.bots.flatMap((entry) => {
  const bot = parseBundle(entry);
  if (
    !tallEyeGlyphs.has(bot.faceEyeCharacter) &&
    !additionallyPromotedMarketplaceIds.has(entry.id)
  ) {
    return [];
  }
  return [{ entry, values: libraryFaceValues(bot, entry.name) }];
});

const databasePath = resolve(databaseArgument);
const db = new DatabaseSync(databasePath, { readOnly: !shouldApply });
let transactionOpen = false;

try {
  const installed = targets.flatMap((target) => {
    const rows = db
      .prepare("SELECT * FROM bots WHERE user_id = ? AND export_hash = ?")
      .all(userId, target.entry.botHash);
    if (rows.length > 1) {
      throw new Error(
        `Found duplicate installed rows for Marketplace bot ${target.entry.name}.`,
      );
    }
    if (rows.length === 0) return [];
    const row = rows[0];
    return [
      {
        ...target,
        row,
        changedFields: changedFields(row, target.values),
        protectedStateHash: protectedStateHash(row),
      },
    ];
  });
  const changed = installed.filter((target) => target.changedFields.length > 0);
  let backupPath = null;
  let protectedStatePreserved = null;

  if (shouldApply) {
    backupPath = resolve(backupArgument);
    if (backupPath === databasePath) {
      throw new Error("The backup path must differ from the live database path.");
    }
    if (existsSync(backupPath)) {
      throw new Error(`Refusing to overwrite existing backup: ${backupPath}`);
    }
    mkdirSync(dirname(backupPath), { recursive: true });
    await backup(db, backupPath);
    const backupDb = new DatabaseSync(backupPath, { readOnly: true });
    try {
      assertDatabaseIntegrity(backupDb, "Backup database");
    } finally {
      backupDb.close();
    }

    const verifyInstalledRows = () => {
      for (const target of installed) {
        const row = db
          .prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?")
          .get(target.row.id, userId);
        if (!row) {
          throw new Error(
            `Installed ${target.entry.name} disappeared during sync.`,
          );
        }
        const drift = changedFields(row, target.values);
        if (drift.length > 0) {
          throw new Error(
            `${target.entry.name} still differs after sync: ${drift.join(", ")}.`,
          );
        }
        if (protectedStateHash(row) !== target.protectedStateHash) {
          throw new Error(
            `${target.entry.name} personal state changed during face sync.`,
          );
        }
      }
    };

    if (changed.length > 0) {
      const assignments = syncColumns.map((column) => `${column} = ?`).join(", ");
      const update = db.prepare(
        `UPDATE bots SET ${assignments}, updated_at = ? WHERE id = ? AND user_id = ?`,
      );
      const updatedAt = new Date().toISOString();
      db.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      for (const target of changed) {
        const result = update.run(
          ...syncColumns.map((column) => target.values[column]),
          updatedAt,
          target.row.id,
          userId,
        );
        if (result.changes !== 1) {
          throw new Error(`Could not update installed ${target.entry.name}.`);
        }
      }
      verifyInstalledRows();
      db.exec("COMMIT");
      transactionOpen = false;
    } else {
      verifyInstalledRows();
    }
    protectedStatePreserved = true;
    assertDatabaseIntegrity(db, "Live database");
  }

  console.log(
    JSON.stringify(
      {
        mode: shouldApply ? "apply" : "dry-run",
        marketplaceTargets: targets.length,
        installedTargets: installed.length,
        changedTargets: changed.length,
        unchangedTargets: installed.length - changed.length,
        missingTargets: targets.length - installed.length,
        protectedStatePreserved,
        backupPath,
        bots: installed.map((target) => ({
          marketplaceName: target.entry.name,
          installedName: target.row.name,
          changedFields: target.changedFields,
        })),
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (transactionOpen) db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}
