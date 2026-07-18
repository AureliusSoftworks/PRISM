#!/usr/bin/env node

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
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { backup, DatabaseSync } from "node:sqlite";

import {
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeCount,
  normalizeBotFaceEyeRotationDeg,
} from "@localai/shared";

const root = resolve(import.meta.dirname, "..");
const manifestPath = join(
  root,
  "apps/web/public/bot-marketplace/manifest.json",
);
const revision = "2026-07-17T22:50:30.000Z";
// Curated catalog entries get an authored two-eye expression. Most glyphs
// render as a duplicated pair; selected relation glyphs are already complete
// two-eye expressions and stay precomposed. Carl Jung intentionally keeps the
// saved default Playful eyes.
const customEyesByMarketplaceId = new Map([
  ["pia", "♥"],
  ["rowan", "⌁"],
  ["iris", "◇"],
  ["sol", "☀"],
  ["mira", "✦"],
  ["benjamin-franklin", "⌁"],
  ["socrates", "?"],
  ["the-buddha", "○"],
  ["rumi", "∞"],
  ["leonardo-da-vinci", "◇"],
  ["salvador-dali", "∿"],
  ["vincent-van-gogh", "⊙"],
  ["georgia-okeeffe", "◉"],
  ["machiavelli", "⌃"],
  ["sun-tzu", "⌖"],
  ["carl-von-clausewitz", "⊕"],
  ["alan-watts", "="],
  ["nikola-tesla", "ϟ"],
  ["albert-einstein", "∗"],
  ["isaac-newton", "●"],
  ["marie-curie", "✣"],
  ["charles-darwin", "◌"],
  ["martin-luther-king-jr", "✦"],
  ["harriet-tubman", "◆"],
  ["edgar-allan-poe", "†"],
  ["aristotle", "≑"],
  ["thomas-hobbes", "="],
  ["claude-monet", "≍"],
  ["joseph-campbell", "≈"],
  ["sigmund-freud", "≎"],
]);
const precomposedPairEyeIds = new Set([
  "alan-watts",
  "aristotle",
  "thomas-hobbes",
  "claude-monet",
  "joseph-campbell",
  "sigmund-freud",
]);
const restoredEyeGeometryByMarketplaceId = new Map([
  [
    "alan-watts",
    { faceEyesFont: "warm", faceEyeOffsetX: 0, faceEyeOffsetY: -0.18 },
  ],
  [
    "carl-jung",
    {
      faceEyesFont: "playful",
      faceEyeOffsetX: 0.02,
      faceEyeOffsetY: -0.02,
      faceEyeRotationDeg: 0,
    },
  ],
]);

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function flagValues(flag) {
  return process.argv.flatMap((value, index) =>
    value === flag && process.argv[index + 1]
      ? [process.argv[index + 1]]
      : [],
  );
}

const databaseArgument = flagValue("--db");
const userId = flagValue("--user-id");
const workspaceBackupArgument = flagValue("--workspace-backup");
const databaseBackupArgument = flagValue("--db-backup");
const selectedMarketplaceIds = new Set(flagValues("--marketplace-id"));
const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");

if (!databaseArgument || !userId || shouldApply === explicitDryRun) {
  throw new Error(
    "Usage: rebalance-marketplace-special-eyes.mjs --db /absolute/path/localai.db --user-id ID [--marketplace-id ID ...] (--dry-run | --apply --workspace-backup /new/directory --db-backup /new/backup.db)",
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

function bundlePathFor(entry) {
  return join(
    dirname(manifestPath),
    entry.bundlePath.replace(/^\/bot-marketplace\//u, ""),
  );
}

function readArchive(entry) {
  const bundlePath = bundlePathFor(entry);
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
    throw new Error(
      `${entry.name} bundle identity does not match the manifest.`,
    );
  }
  if (document.bot?.name !== entry.name) {
    throw new Error(`${entry.name} bundle name does not match the manifest.`);
  }
  return { bundlePath, entries, document };
}

function targetEyeValues(entry) {
  const customGlyph = customEyesByMarketplaceId.get(entry.id) ?? null;
  const usesPrecomposedPair = precomposedPairEyeIds.has(entry.id);
  const eyeCount = customGlyph === null || usesPrecomposedPair ? 1 : 2;
  const rotationDeg = customGlyph === null || usesPrecomposedPair ? 0 : -90;
  const restoredGeometry =
    restoredEyeGeometryByMarketplaceId.get(entry.id) ?? null;
  return {
    archive: {
      faceEyeCharacter: customGlyph,
      faceEyeCount: eyeCount,
      faceEyeRotationDeg: customGlyph === null ? null : rotationDeg,
      ...(restoredGeometry ?? {}),
    },
    database: {
      face_eye_character: customGlyph,
      face_eye_count: eyeCount,
      face_eye_rotation_deg: rotationDeg,
      ...(restoredGeometry
        ? {
            face_eyes_font: restoredGeometry.faceEyesFont,
            face_eye_offset_x: restoredGeometry.faceEyeOffsetX,
            face_eye_offset_y: restoredGeometry.faceEyeOffsetY,
          }
        : {}),
    },
  };
}

function changedArchiveFields(bot, values) {
  return Object.entries(values)
    .filter(([field, value]) => bot[field] !== value)
    .map(([field]) => field);
}

function changedDatabaseFields(
  row,
  values,
  hasEyeCountColumn,
  hasEyeRotationColumn,
) {
  return Object.keys(values).filter((column) => {
    let current = row[column];
    if (column === "face_eye_count" && !hasEyeCountColumn) current = 1;
    if (column === "face_eye_rotation_deg" && !hasEyeRotationColumn) {
      current = 0;
    }
    return current !== values[column];
  });
}

function protectedStateHash(row, mutableColumns) {
  return sha256(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(row).filter(
          ([column]) =>
            !mutableColumns.includes(column) && column !== "updated_at",
        ),
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

function rebuildArchive(target, outputPath) {
  const scratch = mkdtempSync(join(tmpdir(), "prism-marketplace-eyes-"));
  try {
    execFileSync("unzip", ["-qq", target.archive.bundlePath, "-d", scratch]);
    const botJsonPath = join(scratch, "bot.json");
    const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
    Object.assign(document.bot, target.values.archive);
    document.exportedAt = revision;
    writeFileSync(botJsonPath, `${JSON.stringify(document, null, 2)}\n`);
    execFileSync("zip", ["-X", "-q", outputPath, ...target.archive.entries], {
      cwd: scratch,
    });
    const rebuilt = JSON.parse(
      execFileSync("unzip", ["-p", outputPath, "bot.json"], {
        encoding: "utf8",
      }),
    );
    if (rebuilt.botHash !== target.entry.botHash) {
      throw new Error(
        `${target.entry.name} changed stable identity while rebuilding.`,
      );
    }
    if (
      rebuilt.bot.faceEyeCharacter !== target.values.archive.faceEyeCharacter ||
      rebuilt.bot.faceEyeCount !== target.values.archive.faceEyeCount ||
      rebuilt.bot.faceEyeRotationDeg !==
        target.values.archive.faceEyeRotationDeg
    ) {
      throw new Error(
        `${target.entry.name} eye values did not survive rebuilding.`,
      );
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
for (const [marketplaceId, glyph] of customEyesByMarketplaceId) {
  if (!manifest.bots.some((entry) => entry.id === marketplaceId)) {
    throw new Error(`Unknown custom-eye Marketplace id: ${marketplaceId}`);
  }
  if (normalizeBotFaceEyeCharacter(glyph) !== glyph) {
    throw new Error(`Invalid custom eye glyph for ${marketplaceId}: ${glyph}`);
  }
  if (normalizeBotFaceEyeCount(2) !== 2) {
    throw new Error("Two-eye rendering support is unavailable.");
  }
  if (normalizeBotFaceEyeRotationDeg(-90) !== -90) {
    throw new Error("Paired-eye rotation support is unavailable.");
  }
}

for (const marketplaceId of selectedMarketplaceIds) {
  if (!manifest.bots.some((entry) => entry.id === marketplaceId)) {
    throw new Error(`Unknown selected Marketplace id: ${marketplaceId}`);
  }
}

const targetEntries =
  selectedMarketplaceIds.size === 0
    ? manifest.bots
    : manifest.bots.filter((entry) => selectedMarketplaceIds.has(entry.id));
const targets = targetEntries.map((entry) => {
  const archive = readArchive(entry);
  const values = targetEyeValues(entry);
  return {
    entry,
    archive,
    values,
    changedArchiveFields: changedArchiveFields(
      archive.document.bot,
      values.archive,
    ),
  };
});

const databasePath = resolve(databaseArgument);
const db = new DatabaseSync(databasePath, { readOnly: !shouldApply });
let transactionOpen = false;
let stagedDirectory = null;

try {
  const user = db
    .prepare("SELECT id, display_name FROM users WHERE id = ?")
    .get(userId);
  if (!user) throw new Error(`Library user does not exist: ${userId}`);

  const hasEyeCountColumn =
    db
      .prepare(
        "SELECT 1 FROM pragma_table_info('bots') WHERE name = 'face_eye_count'",
      )
      .get() !== undefined;
  const hasEyeRotationColumn =
    db
      .prepare(
        "SELECT 1 FROM pragma_table_info('bots') WHERE name = 'face_eye_rotation_deg'",
      )
      .get() !== undefined;
  const installed = [];
  const missing = [];

  for (const target of targets) {
    const rows = db
      .prepare("SELECT * FROM bots WHERE user_id = ? AND export_hash = ?")
      .all(userId, target.entry.botHash);
    if (rows.length > 1) {
      throw new Error(
        `Found duplicate installed rows for Marketplace bot ${target.entry.name}.`,
      );
    }
    if (rows.length === 0) {
      missing.push(target.entry.name);
      continue;
    }
    installed.push({
      ...target,
      row: rows[0],
      changedDatabaseFields: changedDatabaseFields(
        rows[0],
        target.values.database,
        hasEyeCountColumn,
        hasEyeRotationColumn,
      ),
      protectedStateHash: protectedStateHash(
        rows[0],
        Object.keys(target.values.database),
      ),
    });
  }

  const changedArchives = targets.filter(
    (target) => target.changedArchiveFields.length > 0,
  );
  const targetCustomEyeCount = targets.filter(
    (target) => target.values.archive.faceEyeCharacter !== null,
  ).length;
  const changedInstalled = installed.filter(
    (target) => target.changedDatabaseFields.length > 0,
  );
  let protectedStatePreserved = null;
  let backupDatabaseIntegrity = null;
  let liveDatabaseIntegrity = null;

  if (shouldApply) {
    const workspaceBackupPath = resolve(workspaceBackupArgument);
    const databaseBackupPath = resolve(databaseBackupArgument);
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
      throw new Error(
        "The database backup must differ from the live database.",
      );
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
          manifestSha256: sha256(readFileSync(manifestPath)),
          bundles: targets.map((target) => ({
            id: target.entry.id,
            botHash: target.entry.botHash,
            archiveEntries: target.archive.entries,
            sha256: sha256(readFileSync(target.archive.bundlePath)),
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

    stagedDirectory = mkdtempSync(
      join(tmpdir(), "prism-marketplace-eyes-stage-"),
    );
    for (const target of changedArchives) {
      rebuildArchive(
        target,
        join(stagedDirectory, basename(target.archive.bundlePath)),
      );
    }

    db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    if (!hasEyeCountColumn) {
      db.exec(
        "ALTER TABLE bots ADD COLUMN face_eye_count INTEGER NOT NULL DEFAULT 1;",
      );
    }
    if (!hasEyeRotationColumn) {
      db.exec(
        "ALTER TABLE bots ADD COLUMN face_eye_rotation_deg REAL NOT NULL DEFAULT 0;",
      );
    }
    const updatedAt = new Date().toISOString();
    for (const target of changedInstalled) {
      const columns = Object.keys(target.values.database);
      const update = db.prepare(
        `UPDATE bots SET ${columns.map((column) => `${column} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND user_id = ?`,
      );
      const result = update.run(
        ...columns.map((column) => target.values.database[column]),
        updatedAt,
        target.row.id,
        userId,
      );
      if (result.changes !== 1) {
        throw new Error(`Could not update installed ${target.entry.name}.`);
      }
    }
    for (const target of installed) {
      const row = db
        .prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?")
        .get(target.row.id, userId);
      if (!row) throw new Error(`Installed ${target.entry.name} disappeared.`);
      if (
        Object.entries(target.values.database).some(
          ([column, value]) => row[column] !== value,
        )
      ) {
        throw new Error(
          `${target.entry.name} still differs after Library sync.`,
        );
      }
      if (
        protectedStateHash(row, Object.keys(target.values.database)) !==
        target.protectedStateHash
      ) {
        throw new Error(
          `${target.entry.name} personal state changed during eye sync.`,
        );
      }
    }
    db.exec("COMMIT");
    transactionOpen = false;
    protectedStatePreserved = true;
    assertDatabaseIntegrity(db, "Live database");
    liveDatabaseIntegrity = "ok";

    for (const target of changedArchives) {
      renameSync(
        join(stagedDirectory, basename(target.archive.bundlePath)),
        target.archive.bundlePath,
      );
    }
    if (changedArchives.length > 0) {
      manifest.updatedAt = revision;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: shouldApply ? "apply" : "dry-run",
        libraryUser: { id: user.id, displayName: user.display_name },
        marketplaceBots: targets.length,
        marketplaceCustomEyes: targetCustomEyeCount,
        marketplaceDefaultEyes: targets.length - targetCustomEyeCount,
        changedMarketplaceBots: changedArchives.length,
        installedMatches: installed.length,
        changedInstalledBots: changedInstalled.length,
        missingInstalledBots: missing,
        databaseHadEyeCountColumn: hasEyeCountColumn,
        databaseHadEyeRotationColumn: hasEyeRotationColumn,
        protectedStatePreserved,
        backupDatabaseIntegrity,
        liveDatabaseIntegrity,
        customEyes: targets
          .filter((target) => target.values.archive.faceEyeCharacter !== null)
          .map((target) => ({
            id: target.entry.id,
            name: target.entry.name,
            glyph: target.values.archive.faceEyeCharacter,
            rotationDeg: target.values.archive.faceEyeRotationDeg,
          })),
        defaultEyes: targets
          .filter((target) => target.values.archive.faceEyeCharacter === null)
          .map((target) => target.entry.name),
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (transactionOpen) db.exec("ROLLBACK");
  throw error;
} finally {
  if (stagedDirectory) {
    rmSync(stagedDirectory, { recursive: true, force: true });
  }
  db.close();
}
