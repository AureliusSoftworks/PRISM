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

const root = resolve(import.meta.dirname, "..");
const marketplaceRoot = join(root, "apps/web/public/bot-marketplace");
const manifestPath = join(marketplaceRoot, "manifest.json");

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");
const skipMarketplace = process.argv.includes("--skip-marketplace");
const databaseArgument = flagValue("--db");
const userIdArgument = flagValue("--user-id");
const workspaceBackupArgument = flagValue("--workspace-backup");
const databaseBackupArgument = flagValue("--db-backup");

if (shouldApply === explicitDryRun) {
  throw new Error("Choose exactly one of --dry-run or --apply.");
}
if (shouldApply && !skipMarketplace && !workspaceBackupArgument) {
  throw new Error("Applying Marketplace updates requires --workspace-backup PATH.");
}
if (databaseArgument && !userIdArgument) {
  throw new Error("--db requires --user-id.");
}
if (shouldApply && databaseArgument && !databaseBackupArgument) {
  throw new Error("Applying Library updates requires --db-backup PATH.");
}
if (databaseBackupArgument && !databaseArgument) {
  throw new Error("--db-backup requires --db PATH.");
}
if (skipMarketplace && !databaseArgument) {
  throw new Error("Nothing to do: --skip-marketplace requires --db PATH.");
}

function desiredEffectForName(name) {
  return /^(?:darth\s+)?vader(?:\s+\(copy\))?$/iu.test(name.trim())
    ? "resonance"
    : "chorus";
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseProfile(value, label) {
  const profile = typeof value === "string" ? JSON.parse(value) : value;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new Error(`${label} is missing a valid voice profile.`);
  }
  return profile;
}

function protectedProfileHash(profile) {
  const protectedProfile = Object.fromEntries(
    Object.entries(profile).filter(
      ([key]) => key !== "elevenLabsEffect" && key !== "voiceEffectExplicit",
    ),
  );
  return sha256(JSON.stringify(protectedProfile));
}

function patchedProfile(profile, name) {
  return {
    ...profile,
    elevenLabsEffect: desiredEffectForName(name),
    voiceEffectExplicit: true,
  };
}

function bundlePathFor(entry) {
  return join(
    marketplaceRoot,
    entry.bundlePath.replace(/^\/bot-marketplace\//u, ""),
  );
}

function readBundle(entry) {
  const bundlePath = bundlePathFor(entry);
  const entryNames = execFileSync("unzip", ["-Z1", bundlePath], {
    encoding: "utf8",
  })
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean);
  if (!entryNames.includes("bot.json") || !entryNames.includes("memories.json")) {
    throw new Error(`${entry.name} bundle is missing a required entry.`);
  }
  const document = JSON.parse(
    execFileSync("unzip", ["-p", bundlePath, "bot.json"], {
      encoding: "utf8",
    }),
  );
  if (document.botHash !== entry.botHash || document.bot?.name !== entry.name) {
    throw new Error(`${entry.name} bundle identity does not match the manifest.`);
  }
  const profile = parseProfile(
    document.bot.authoredAudioVoiceProfile,
    `${entry.name} Marketplace voice`,
  );
  const desiredProfile = patchedProfile(profile, entry.name);
  return {
    entry,
    bundlePath,
    entryNames,
    document,
    profile,
    desiredProfile,
    protectedProfileHash: protectedProfileHash(profile),
    changed: JSON.stringify(profile) !== JSON.stringify(desiredProfile),
  };
}

function protectedRowHash(row) {
  const protectedRow = Object.fromEntries(
    Object.entries(row).filter(
      ([column]) =>
        column !== "audio_voice_profile_override" && column !== "updated_at",
    ),
  );
  return sha256(JSON.stringify(protectedRow));
}

function assertDatabaseIntegrity(database, label) {
  const result = database.prepare("PRAGMA integrity_check").get();
  if (result?.integrity_check !== "ok") {
    throw new Error(`${label} failed SQLite integrity_check.`);
  }
}

const manifest = skipMarketplace
  ? null
  : JSON.parse(readFileSync(manifestPath, "utf8"));
const marketplaceTargets = manifest?.bots.map(readBundle) ?? [];

let database = null;
let libraryTargets = [];
if (databaseArgument) {
  database = new DatabaseSync(resolve(databaseArgument), {
    readOnly: !shouldApply,
  });
  const user = database
    .prepare("SELECT id, display_name FROM users WHERE id = ?")
    .get(userIdArgument);
  if (!user) {
    throw new Error("The requested Library user does not exist in this database.");
  }
  const rows = database
    .prepare("SELECT * FROM bots WHERE user_id = ? ORDER BY lower(name), id")
    .all(userIdArgument);
  if (rows.length === 0) {
    throw new Error(`${user.display_name}'s Library is empty.`);
  }
  const vaderRows = rows.filter((row) => /\bvader\b/iu.test(row.name));
  const recognizedVaderRows = vaderRows.filter(
    (row) => desiredEffectForName(row.name) === "resonance",
  );
  if (vaderRows.length !== 1 || recognizedVaderRows.length !== 1) {
    throw new Error(
      `Expected one recognizable Vader Library bot; found ${vaderRows.length}.`,
    );
  }
  libraryTargets = rows.map((row) => {
    const sourceProfileValue = row.audio_voice_profile_override?.trim()
      ? row.audio_voice_profile_override
      : row.authored_audio_voice_profile;
    const profile = parseProfile(
      sourceProfileValue,
      `${row.name} effective Library voice`,
    );
    const desiredProfile = patchedProfile(profile, row.name);
    return {
      row,
      profile,
      source: row.audio_voice_profile_override?.trim() ? "override" : "authored",
      desiredProfile,
      desiredProfileText: JSON.stringify(desiredProfile),
      protectedProfileHash: protectedProfileHash(profile),
      protectedRowHash: protectedRowHash(row),
      changed: JSON.stringify(profile) !== JSON.stringify(desiredProfile),
    };
  });
  assertDatabaseIntegrity(database, "Live database before update");
}

let workspaceBackupPath = null;
let databaseBackupPath = null;
let updatedAt = null;
let transactionOpen = false;

try {
  if (shouldApply) {
    updatedAt = new Date().toISOString();

    if (manifest) {
      workspaceBackupPath = resolve(workspaceBackupArgument);
      if (existsSync(workspaceBackupPath)) {
        throw new Error(`Refusing to overwrite workspace backup: ${workspaceBackupPath}`);
      }
      mkdirSync(workspaceBackupPath, { recursive: true });
      copyFileSync(manifestPath, join(workspaceBackupPath, "manifest.json"));
      for (const target of marketplaceTargets) {
        copyFileSync(
          target.bundlePath,
          join(workspaceBackupPath, basename(target.bundlePath)),
        );
      }

      for (const target of marketplaceTargets.filter(({ changed }) => changed)) {
        const scratch = mkdtempSync(join(tmpdir(), "prism-voice-effects-"));
        try {
          execFileSync("unzip", ["-qq", target.bundlePath, "-d", scratch]);
          const botJsonPath = join(scratch, "bot.json");
          const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
          document.bot.authoredAudioVoiceProfile = target.desiredProfile;
          document.exportedAt = updatedAt;
          writeFileSync(botJsonPath, `${JSON.stringify(document, null, 2)}\n`);

          const rebuiltPath = join(scratch, basename(target.bundlePath));
          execFileSync("zip", ["-X", "-q", rebuiltPath, ...target.entryNames], {
            cwd: scratch,
          });
          const stagedPath = `${target.bundlePath}.voice-effect-staged`;
          copyFileSync(rebuiltPath, stagedPath);
          renameSync(stagedPath, target.bundlePath);
        } finally {
          rmSync(scratch, { recursive: true, force: true });
        }
      }
      manifest.updatedAt = updatedAt;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }

    if (database) {
      databaseBackupPath = resolve(databaseBackupArgument);
      if (databaseBackupPath === resolve(databaseArgument)) {
        throw new Error("The database backup path must differ from the live database.");
      }
      if (existsSync(databaseBackupPath)) {
        throw new Error(`Refusing to overwrite database backup: ${databaseBackupPath}`);
      }
      mkdirSync(dirname(databaseBackupPath), { recursive: true });
      await backup(database, databaseBackupPath);
      const backupDatabase = new DatabaseSync(databaseBackupPath, {
        readOnly: true,
      });
      try {
        assertDatabaseIntegrity(backupDatabase, "Backup database");
      } finally {
        backupDatabase.close();
      }

      const update = database.prepare(
        "UPDATE bots SET audio_voice_profile_override = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      );
      database.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      for (const target of libraryTargets.filter(({ changed }) => changed)) {
        const result = update.run(
          target.desiredProfileText,
          updatedAt,
          target.row.id,
          userIdArgument,
        );
        if (result.changes !== 1) {
          throw new Error(`Could not update Library bot ${target.row.name}.`);
        }
      }

      for (const target of libraryTargets) {
        const row = database
          .prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?")
          .get(target.row.id, userIdArgument);
        const profile = parseProfile(
          row?.audio_voice_profile_override,
          `${target.row.name} saved Library override`,
        );
        if (
          JSON.stringify(profile) !== target.desiredProfileText ||
          protectedProfileHash(profile) !== target.protectedProfileHash ||
          protectedRowHash(row) !== target.protectedRowHash
        ) {
          throw new Error(`${target.row.name} changed outside voice-effect fields.`);
        }
      }
      database.exec("COMMIT");
      transactionOpen = false;
      assertDatabaseIntegrity(database, "Live database after update");
    }
  }

  if (shouldApply && manifest) {
    for (const target of marketplaceTargets) {
      const updated = readBundle(target.entry);
      if (
        updated.desiredProfile.elevenLabsEffect !==
          desiredEffectForName(target.entry.name) ||
        !updated.desiredProfile.voiceEffectExplicit ||
        protectedProfileHash(updated.profile) !== target.protectedProfileHash
      ) {
        throw new Error(`${target.entry.name} Marketplace voice update did not verify.`);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: shouldApply ? "apply" : "dry-run",
        marketplace: manifest
          ? {
              total: marketplaceTargets.length,
              changed: marketplaceTargets.filter(({ changed }) => changed).length,
              prism: marketplaceTargets.filter(
                ({ entry }) => desiredEffectForName(entry.name) === "chorus",
              ).length,
              resonance: marketplaceTargets.filter(
                ({ entry }) => desiredEffectForName(entry.name) === "resonance",
              ).length,
              workspaceBackupPath,
            }
          : { skipped: true },
        library: database
          ? {
              databasePath: resolve(databaseArgument),
              userId: userIdArgument,
              total: libraryTargets.length,
              changed: libraryTargets.filter(({ changed }) => changed).length,
              prism: libraryTargets.filter(
                ({ row }) => desiredEffectForName(row.name) === "chorus",
              ).length,
              resonance: libraryTargets.filter(
                ({ row }) => desiredEffectForName(row.name) === "resonance",
              ).length,
              databaseBackupPath,
            }
          : { skipped: true },
        updatedAt,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (transactionOpen && database) database.exec("ROLLBACK");
  throw error;
} finally {
  database?.close();
}
