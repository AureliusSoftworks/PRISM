#!/usr/bin/env node

import { mkdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { backup, DatabaseSync } from "node:sqlite";
import {
  freezeDebateMysteryMansionSnapshotV2,
  getDebateMysteryMansionBundleV2,
  retainDebateMysteryMansionSnapshotAssetsV2,
} from "../apps/api/src/debate-mystery-mansion-bundles.ts";
import {
  upgradeInstalledMansionRoomArtFromPackageV1,
} from "../apps/api/src/debate-mystery-mansion-codec.ts";
import { openPortableMysteryEnvelopeV1 } from
  "../apps/api/src/debate-mystery-package-envelope.ts";
import { decryptText, deriveMasterKey } from "../apps/api/src/security.ts";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultPackageDirectory = join(
  repositoryRoot,
  ".codex/output/imagegen/whodunnit-synthesized-pixel-art-v1/packages",
);
const defaultDatabasePath =
  "/Users/jared/Library/Application Support/com.localai.prism-desktop/localai.db";
const jobs = [
  {
    packageName: "asterion-observatory-balanced-mosaic-v5.mansion",
    matches: (name) => name.trim().toLowerCase() === "asterion observatory",
  },
  {
    packageName: "banyan-house-balanced-mosaic-v5.mansion",
    matches: (name) => name.trim().toLowerCase() === "banyan house",
  },
  {
    packageName: "blackwood-house-balanced-mosaic-v5.mansion",
    matches: (name) => name.trim().toLowerCase().startsWith("blackwood house"),
  },
  {
    packageName: "briarwatch-manor-balanced-mosaic-v5.mansion",
    matches: (name) => name.trim().toLowerCase() === "briarwatch manor",
  },
];

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const databasePath = resolve(option("--db", defaultDatabasePath));
const packageDirectory = resolve(option("--package-dir", defaultPackageDirectory));
const masterSecret = process.env.ENCRYPTION_MASTER_KEY;
if (!masterSecret) {
  throw new Error("ENCRYPTION_MASTER_KEY is required. Run this script through with-secrets.");
}

const database = new DatabaseSync(databasePath);
database.exec("PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = ON;");
const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const backupDirectory = join(repositoryRoot, ".codex/output/backups");
await mkdir(backupDirectory, { recursive: true });
const backupPath = join(
  backupDirectory,
  `${basename(databasePath)}.before-balanced-mosaic-v5.${timestamp}.db`,
);
await backup(database, backupPath);

const masterKey = deriveMasterKey(masterSecret);
const userKeyById = new Map();
function userKey(userId) {
  const cached = userKeyById.get(userId);
  if (cached) return cached;
  const row = database.prepare(
    `SELECT wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag
       FROM users WHERE id = ?`,
  ).get(userId);
  if (!row) throw new Error(`User ${userId} was not found.`);
  const key = Buffer.from(decryptText({
    ciphertext: row.wrapped_user_key,
    iv: row.wrapped_user_key_iv,
    tag: row.wrapped_user_key_tag,
  }, masterKey), "base64");
  userKeyById.set(userId, key);
  return key;
}

const upgradedBundles = [];
for (const job of jobs) {
  const targets = database.prepare(
    `SELECT id, user_id, name FROM debate_mystery_mansion_bundles ORDER BY created_at`,
  ).all().filter((row) => job.matches(row.name));
  if (targets.length === 0) {
    throw new Error(`No installed mansion matches ${job.packageName}.`);
  }
  const envelope = openPortableMysteryEnvelopeV1({
    envelope: await readFile(join(packageDirectory, job.packageName)),
  });
  for (const target of targets) {
    const upgraded = upgradeInstalledMansionRoomArtFromPackageV1({
      db: database,
      userKey: userKey(target.user_id),
      userId: target.user_id,
      bundleId: target.id,
      archive: envelope.payload,
    });
    upgradedBundles.push({
      id: target.id,
      userId: target.user_id,
      name: target.name,
      roomCount: upgraded.updatedRoomIds.length,
    });
  }
}

const upgradedBundleIds = new Set(upgradedBundles.map((bundle) => bundle.id));
const refreshedSessions = [];
const sessionRows = database.prepare(
  `SELECT id, user_id, revision, status, session_json
     FROM debate_sessions
    WHERE status IN ('live', 'waiting_for_player', 'paused')`,
).all();
for (const row of sessionRows) {
  const session = JSON.parse(row.session_json);
  const snapshot = session.formatState?.format === "whodunnit"
    ? session.formatState.config?.mansionSnapshot
    : null;
  if (!snapshot || !upgradedBundleIds.has(snapshot.sourceBundleId)) continue;
  const mansion = getDebateMysteryMansionBundleV2(
    database,
    row.user_id,
    snapshot.sourceBundleId,
  );
  const upgradedSnapshot = freezeDebateMysteryMansionSnapshotV2(
    mansion,
    snapshot.capturedAt,
  );
  retainDebateMysteryMansionSnapshotAssetsV2(
    database,
    row.user_id,
    row.id,
    upgradedSnapshot,
  );
  const now = new Date().toISOString();
  const revision = Number(row.revision) + 1;
  const upgradedSession = {
    ...session,
    revision,
    updatedAt: now,
    formatState: {
      ...session.formatState,
      config: {
        ...session.formatState.config,
        mansionSnapshot: upgradedSnapshot,
      },
    },
  };
  database.prepare(
    `UPDATE debate_sessions
        SET revision = ?, session_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND revision = ?`,
  ).run(
    revision,
    JSON.stringify(upgradedSession),
    now,
    row.id,
    row.user_id,
    row.revision,
  );
  refreshedSessions.push({ id: row.id, status: row.status, mansion: mansion.name });
}

const verification = upgradedBundles.map((target) => {
  const mansion = getDebateMysteryMansionBundleV2(database, target.userId, target.id);
  const roomAssets = new Map(
    mansion.assets
      .filter((asset) => asset.role === "room")
      .map((asset) => [asset.logicalId, asset]),
  );
  return {
    name: mansion.name,
    rooms: mansion.layoutV2
      ? mansion.layoutV2.entities.filter((entity) => entity.kind === "room").map((room) => ({
          id: room.id,
          name: room.name,
          accepted: room.acceptedRoomAssetId,
          illustrated: roomAssets.get(`${room.id}:illustrated-v1`)?.id ?? null,
        }))
      : mansion.rooms.map((room) => ({
          id: room.id,
          name: room.name,
          accepted: room.acceptedRoomAssetId ?? roomAssets.get(`${room.id}:accepted-v2`)?.id ?? null,
          illustrated: roomAssets.get(`${room.id}:illustrated-v1`)?.id ?? null,
        })),
  };
});

database.close();
process.stdout.write(`${JSON.stringify({
  backupPath,
  upgradedBundles,
  refreshedSessions,
  verification,
}, null, 2)}\n`);
