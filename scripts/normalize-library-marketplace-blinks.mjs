#!/usr/bin/env node

/**
 * Normalize Jared's Library and Marketplace bots to the canonical blank blink.
 * Darth Vader is the sole intentional exception and remains blink-disabled.
 *
 * Usage:
 *   node --experimental-strip-types scripts/normalize-library-marketplace-blinks.mjs \
 *     --dry-run --db PATH [--user-id ID]
 *   node --experimental-strip-types scripts/normalize-library-marketplace-blinks.mjs \
 *     --apply --db PATH [--user-id ID] --backup-dir PATH
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
import { DEFAULT_BOT_FACE_BLINK_BAR } from "@localai/shared";

const DARTH_VADER_NAME = "Darth Vader";
const DARTH_VADER_BLINK = "none";
const DEFAULT_BLINK = DEFAULT_BOT_FACE_BLINK_BAR;
const root = resolve(import.meta.dirname, "..");
const marketplaceRoot = join(root, "apps/web/public/bot-marketplace");
const manifestPath = join(marketplaceRoot, "manifest.json");
const desktopDbDefault =
  "/Users/jared/Library/Application Support/com.localai.prism-desktop/localai.db";

if (DEFAULT_BLINK !== " ") {
  throw new Error(
    `Expected the canonical blink to be one space, received ${JSON.stringify(DEFAULT_BLINK)}.`,
  );
}

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

function targetBlinkForName(name) {
  return name === DARTH_VADER_NAME ? DARTH_VADER_BLINK : DEFAULT_BLINK;
}

function protectedLibraryHash(row) {
  return sha256(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(row).filter(
          ([column]) => column !== "face_blink_bar" && column !== "updated_at",
        ),
      ),
    ),
  );
}

function protectedBundleDocument(document) {
  const copy = structuredClone(document);
  delete copy.bot.faceBlinkBar;
  return copy;
}

function assertDatabaseIntegrity(database, label) {
  const integrity = database.prepare("PRAGMA integrity_check").get();
  if (integrity?.integrity_check !== "ok") {
    throw new Error(`${label} failed SQLite integrity_check.`);
  }
}

function readBundle(entry, bundlePathOverride = null) {
  const bundlePath =
    bundlePathOverride ??
    join(
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
  return {
    bundlePath,
    entryNames,
    document,
    protectedDocument: protectedBundleDocument(document),
  };
}

function rebuildBundle(target, outputPath) {
  const scratch = mkdtempSync(join(tmpdir(), "prism-blink-bundle-"));
  try {
    execFileSync("unzip", ["-qq", target.bundle.bundlePath, "-d", scratch]);
    const botJsonPath = join(scratch, "bot.json");
    const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
    document.bot.faceBlinkBar = target.after;
    writeFileSync(botJsonPath, `${JSON.stringify(document, null, 2)}\n`);
    execFileSync("zip", ["-X", "-q", outputPath, ...target.bundle.entryNames], {
      cwd: scratch,
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");
const databaseArgument = flagValue("--db") || desktopDbDefault;
const userIdArgument = flagValue("--user-id");
const backupDirectoryArgument = flagValue("--backup-dir");

if (shouldApply === explicitDryRun) {
  throw new Error("Choose either --dry-run or --apply.");
}
if (shouldApply && !backupDirectoryArgument) {
  throw new Error("Applying requires --backup-dir PATH.");
}

const databasePath = resolve(databaseArgument);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const db = new DatabaseSync(databasePath, { readOnly: !shouldApply });
const users = db.prepare("SELECT id FROM users ORDER BY created_at ASC").all();
let userId = userIdArgument;
if (!userId) {
  if (users.length !== 1) {
    throw new Error(
      `Library contains ${users.length} users; provide --user-id explicitly.`,
    );
  }
  userId = users[0].id;
}
if (!users.some((user) => user.id === userId)) {
  throw new Error("The requested Library user does not exist in this database.");
}

const libraryRows = db
  .prepare("SELECT * FROM bots WHERE user_id = ? ORDER BY name, id")
  .all(userId);
const libraryVaders = libraryRows.filter(
  (row) => row.name === DARTH_VADER_NAME,
);
if (libraryVaders.length !== 1) {
  throw new Error(
    `Expected exactly one Library ${DARTH_VADER_NAME}; found ${libraryVaders.length}.`,
  );
}

const libraryTargets = libraryRows.map((row) => ({
  row,
  before: row.face_blink_bar,
  after: targetBlinkForName(row.name),
  protectedHash: protectedLibraryHash(row),
}));
const libraryChanges = libraryTargets.filter(
  (target) => target.before !== target.after,
);

const marketplaceTargets = manifest.bots.map((entry) => {
  const bundle = readBundle(entry);
  return {
    entry,
    bundle,
    before: bundle.document.bot.faceBlinkBar ?? null,
    after: targetBlinkForName(entry.name),
  };
});
const marketplaceVaders = marketplaceTargets.filter(
  (target) => target.entry.name === DARTH_VADER_NAME,
);
if (marketplaceVaders.length !== 1) {
  throw new Error(
    `Expected exactly one Marketplace ${DARTH_VADER_NAME}; found ${marketplaceVaders.length}.`,
  );
}
const marketplaceChanges = marketplaceTargets.filter(
  (target) => target.before !== target.after,
);

const summary = {
  mode: shouldApply ? "apply" : "dry-run",
  databasePath,
  userId,
  canonicalDefaultBlink: DEFAULT_BLINK,
  darthVaderBlink: DARTH_VADER_BLINK,
  totals: {
    libraryBots: libraryTargets.length,
    libraryChanging: libraryChanges.length,
    marketplaceBots: marketplaceTargets.length,
    marketplaceChanging: marketplaceChanges.length,
  },
  libraryChanges: libraryChanges.map((target) => ({
    id: target.row.id,
    name: target.row.name,
    before: target.before,
    after: target.after,
  })),
  marketplaceChanges: marketplaceChanges.map((target) => ({
    id: target.entry.id,
    name: target.entry.name,
    before: target.before,
    after: target.after,
  })),
};

console.log(JSON.stringify(summary, null, 2));

if (!shouldApply) {
  assertDatabaseIntegrity(db, "Live database");
  db.close();
  process.exit(0);
}

const backupDirectory = resolve(backupDirectoryArgument);
if (existsSync(backupDirectory)) {
  throw new Error(`Refusing to overwrite existing backup: ${backupDirectory}`);
}
mkdirSync(backupDirectory, { recursive: true });
const bundleBackupDirectory = join(backupDirectory, "marketplace-bundles");
mkdirSync(bundleBackupDirectory, { recursive: true });
copyFileSync(manifestPath, join(backupDirectory, "manifest.json"));
for (const target of marketplaceChanges) {
  copyFileSync(
    target.bundle.bundlePath,
    join(bundleBackupDirectory, basename(target.bundle.bundlePath)),
  );
}
writeFileSync(
  join(backupDirectory, "audit-before.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);

const databaseBackupPath = join(backupDirectory, "localai.db");
await backup(db, databaseBackupPath);
const backupDb = new DatabaseSync(databaseBackupPath, { readOnly: true });
try {
  assertDatabaseIntegrity(backupDb, "Backup database");
} finally {
  backupDb.close();
}

const stagedDirectory = mkdtempSync(join(tmpdir(), "prism-blink-stage-"));
let workspaceMutated = false;
let transactionOpen = false;
try {
  for (const target of marketplaceChanges) {
    const stagedPath = join(
      stagedDirectory,
      basename(target.bundle.bundlePath),
    );
    rebuildBundle(target, stagedPath);
    const staged = readBundle(target.entry, stagedPath);
    if (staged.document.bot.faceBlinkBar !== target.after) {
      throw new Error(`${target.entry.name} staged blink did not apply.`);
    }
    if (!jsonEqual(staged.protectedDocument, target.bundle.protectedDocument)) {
      throw new Error(`${target.entry.name} staged bundle changed unrelated data.`);
    }
    if (!jsonEqual(staged.entryNames, target.bundle.entryNames)) {
      throw new Error(`${target.entry.name} staged archive entries changed.`);
    }
  }

  db.exec("BEGIN IMMEDIATE");
  transactionOpen = true;
  for (const target of libraryChanges) {
    const current = db
      .prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?")
      .get(target.row.id, userId);
    if (!current) {
      throw new Error(`${target.row.name} disappeared during migration.`);
    }
    if (
      protectedLibraryHash(current) !== target.protectedHash ||
      current.face_blink_bar !== target.before
    ) {
      throw new Error(
        `${target.row.name} changed after the dry run; aborting safely.`,
      );
    }
  }

  const revision = new Date().toISOString();
  const updateBlink = db.prepare(
    "UPDATE bots SET face_blink_bar = ?, updated_at = ? WHERE id = ? AND user_id = ?",
  );
  for (const target of libraryChanges) {
    updateBlink.run(target.after, revision, target.row.id, userId);
  }

  workspaceMutated = true;
  for (const target of marketplaceChanges) {
    renameSync(
      join(stagedDirectory, basename(target.bundle.bundlePath)),
      target.bundle.bundlePath,
    );
  }
  if (marketplaceChanges.length > 0) {
    manifest.updatedAt = revision;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  for (const target of libraryTargets) {
    const row = db
      .prepare("SELECT name, face_blink_bar FROM bots WHERE id = ? AND user_id = ?")
      .get(target.row.id, userId);
    if (!row || row.face_blink_bar !== target.after) {
      throw new Error(`${target.row.name} Library blink verification failed.`);
    }
  }
  for (const target of marketplaceTargets) {
    const bundle = readBundle(target.entry);
    if (bundle.document.bot.faceBlinkBar !== target.after) {
      throw new Error(`${target.entry.name} Marketplace blink verification failed.`);
    }
    if (!jsonEqual(bundle.protectedDocument, target.bundle.protectedDocument)) {
      throw new Error(`${target.entry.name} Marketplace data changed unexpectedly.`);
    }
  }
  assertDatabaseIntegrity(db, "Live database");
  db.exec("COMMIT");
  transactionOpen = false;

  writeFileSync(
    join(backupDirectory, "audit-after.json"),
    `${JSON.stringify(
      {
        completedAt: revision,
        libraryBotsVerified: libraryTargets.length,
        marketplaceBotsVerified: marketplaceTargets.length,
        libraryChanged: libraryChanges.length,
        marketplaceChanged: marketplaceChanges.length,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        mode: "apply-complete",
        backupDirectory,
        databaseBackupPath,
        libraryChanged: libraryChanges.length,
        marketplaceChanged: marketplaceChanges.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (transactionOpen) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Preserve the original error.
    }
  }
  if (workspaceMutated) {
    copyFileSync(join(backupDirectory, "manifest.json"), manifestPath);
    for (const target of marketplaceChanges) {
      copyFileSync(
        join(bundleBackupDirectory, basename(target.bundle.bundlePath)),
        target.bundle.bundlePath,
      );
    }
  }
  throw error;
} finally {
  rmSync(stagedDirectory, { recursive: true, force: true });
  db.close();
}
