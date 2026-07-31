#!/usr/bin/env node
/**
 * Curate portable ElevenLabs Voice ID overrides for public Marketplace bots
 * (skips branch-locked / library-dev-backup). Reads the repo lock file
 * apps/web/public/bot-marketplace/elevenlabs-voice-lock.json, verifies each
 * locked voice name+ID against Jared's authenticated ElevenLabs library, then
 * syncs authored profiles to matching Library bots by export_hash.
 *
 * Usage:
 *   node --experimental-strip-types scripts/update-marketplace-bot-elevenlabs-voices.mjs --dry-run --db PATH
 *   node --experimental-strip-types scripts/update-marketplace-bot-elevenlabs-voices.mjs --apply \
 *     --db PATH --workspace-backup PATH --db-backup PATH
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
  serializeBotAudioVoiceProfileV1,
} from "@localai/shared";

const root = resolve(import.meta.dirname, "..");
const marketplaceRoot = join(root, "apps/web/public/bot-marketplace");
const manifestPath = join(marketplaceRoot, "manifest.json");
const voiceLockPath = join(marketplaceRoot, "elevenlabs-voice-lock.json");
const desktopDbDefault =
  "/Users/jared/Library/Application Support/com.localai.prism-desktop/localai.db";

/**
 * Repo-locked portable ElevenLabs overrides for public Marketplace bots.
 * Source of truth: apps/web/public/bot-marketplace/elevenlabs-voice-lock.json
 */
const voiceLock = JSON.parse(readFileSync(voiceLockPath, "utf8"));
if (!voiceLock?.bots || typeof voiceLock.bots !== "object") {
  throw new Error("elevenlabs-voice-lock.json is missing a bots map.");
}

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function normalizeVoiceName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

const shouldApply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");
const databaseArgument = flagValue("--db") || desktopDbDefault;
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

const onlyIds = onlyArgument
  ? new Set(
      onlyArgument
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    )
  : null;

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
  return voices.map((voice) => ({
    voiceId: String(voice.voiceId || voice.voice_id || "").trim(),
    name: String(voice.name || "").trim(),
    labels:
      voice.labels && typeof voice.labels === "object" ? voice.labels : {},
  })).filter((voice) => voice.voiceId && voice.name);
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

function resolveLockedVoice(catalogByName, catalogById, locked, botLabel) {
  const byId = catalogById.get(locked.voiceId);
  if (!byId) {
    throw new Error(
      `${botLabel}: locked ElevenLabs voice ID ${locked.voiceId} is not in the live library.`,
    );
  }
  const byName = catalogByName.get(normalizeVoiceName(locked.voiceName));
  if (!byName) {
    throw new Error(
      `${botLabel}: locked ElevenLabs voice name "${locked.voiceName}" is not in the live library.`,
    );
  }
  if (byId.voiceId !== byName.voiceId) {
    throw new Error(
      `${botLabel}: locked voice name "${locked.voiceName}" resolves to ${byName.voiceId}, but lock ID is ${locked.voiceId}.`,
    );
  }
  return byId;
}

const cookie = resolveLiveSessionCookie(databaseArgument);
const catalog = await fetchElevenLabsCatalog(cookie);
const catalogByName = new Map();
const catalogById = new Map();
for (const voice of catalog) {
  const key = normalizeVoiceName(voice.name);
  if (catalogByName.has(key) && catalogByName.get(key).voiceId !== voice.voiceId) {
    throw new Error(`Ambiguous ElevenLabs library voice name: ${voice.name}`);
  }
  catalogByName.set(key, voice);
  catalogById.set(voice.voiceId, voice);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const publicEntries = manifest.bots.filter((entry) => {
  if (entry.branchLock) return false;
  if (onlyIds && !onlyIds.has(entry.id)) return false;
  return true;
});

const missingRecipes = publicEntries
  .map((entry) => entry.id)
  .filter((id) => !voiceLock.bots[id]);
const extraRecipes = Object.keys(voiceLock.bots).filter(
  (id) => !publicEntries.some((entry) => entry.id === id) && !onlyIds,
);
if (missingRecipes.length || extraRecipes.length) {
  throw new Error(
    `Voice lock mismatch. Missing: ${missingRecipes.join(", ") || "—"}; extra: ${extraRecipes.join(", ") || "—"}.`,
  );
}

const targets = publicEntries.map((entry) => {
  const bundle = readBundle(entry);
  const locked = voiceLock.bots[entry.id];
  const resolved = resolveLockedVoice(
    catalogByName,
    catalogById,
    locked,
    entry.name,
  );
  const current = normalizeBotAudioVoiceProfileV1(
    bundle.document.bot?.authoredAudioVoiceProfile,
  );
  const next = normalizeBotAudioVoiceProfileV1({
    ...current,
    elevenLabsVoiceIdOverride: resolved.voiceId,
  });
  const authoredJson = serializeBotAudioVoiceProfileV1(next);
  const marketplaceChanged =
    current.elevenLabsVoiceIdOverride !== next.elevenLabsVoiceIdOverride;
  return {
    entry,
    ...bundle,
    requestedName: locked.voiceName,
    resolved,
    currentOverride: current.elevenLabsVoiceIdOverride || null,
    next,
    authoredJson,
    marketplaceChanged,
  };
});

const changedTargets = targets.filter((target) => target.marketplaceChanged);

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
  installedTargets = changedTargets.flatMap((targetEntry) => {
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
    const nextAuthored = normalizeBotAudioVoiceProfileV1({
      ...currentAuthored,
      elevenLabsVoiceIdOverride: targetEntry.resolved.voiceId,
    });
    const authoredJson = serializeBotAudioVoiceProfileV1(nextAuthored);
    return [
      {
        ...targetEntry,
        row,
        authoredJson,
        libraryChanged:
          currentAuthored.elevenLabsVoiceIdOverride !==
          nextAuthored.elevenLabsVoiceIdOverride,
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
    for (const targetEntry of changedTargets) {
      copyFileSync(
        targetEntry.bundlePath,
        join(workspaceBackupPath, basename(targetEntry.bundlePath)),
      );
    }

    if (changedTargets.length > 0) {
      marketplaceUpdatedAt = new Date().toISOString();
      for (const targetEntry of changedTargets) {
        const scratch = mkdtempSync(
          join(tmpdir(), "prism-marketplace-elevenlabs-"),
        );
        try {
          execFileSync("unzip", ["-qq", targetEntry.bundlePath, "-d", scratch]);
          const botJsonPath = join(scratch, "bot.json");
          const document = JSON.parse(readFileSync(botJsonPath, "utf8"));
          document.bot.authoredAudioVoiceProfile = targetEntry.next;
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
            throw new Error(`${targetEntry.entry.name} ElevenLabs sync did not persist.`);
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
        catalogVoices: catalog.length,
        marketplace: {
          scannedPublic: targets.length,
          changed: changedTargets.length,
          unchanged: targets.length - changedTargets.length,
          skippedBranchLocked: manifest.bots.filter((entry) => entry.branchLock)
            .length,
          updatedAt: marketplaceUpdatedAt,
          workspaceBackupPath,
          bots: changedTargets.map((targetEntry) => ({
            id: targetEntry.entry.id,
            name: targetEntry.entry.name,
            voiceName: targetEntry.requestedName,
            voiceId: targetEntry.resolved.voiceId,
            from: targetEntry.currentOverride,
            to: targetEntry.resolved.voiceId,
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
              missing: changedTargets.length - installedTargets.length,
              databaseBackupPath,
              bots: installedTargets.map((targetEntry) => ({
                marketplaceName: targetEntry.entry.name,
                installedName: targetEntry.row.name,
                changed: targetEntry.libraryChanged,
                voiceName: targetEntry.requestedName,
              })),
              missingBots: changedTargets
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
