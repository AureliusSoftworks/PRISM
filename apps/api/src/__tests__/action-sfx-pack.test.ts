import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ACTION_SFX_PACK_CLIP_COUNT,
  ACTION_SFX_PACK_KINDS,
} from "@localai/shared";
import {
  ensureActionSfxPackSchema,
  generateActionSfxPack,
  getActionSfxPackClip,
  getActionSfxPackSummary,
  listActionSfxPackClipsForBackup,
  restoreActionSfxPackClipsFromBackup,
} from "../action-sfx-pack.ts";

const tinyWav = Buffer.from(
  "UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=",
  "base64",
);

function createPackTestDb(): { db: DatabaseSync; userId: string } {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY);
  `);
  ensureActionSfxPackSchema(db);
  const userId = "user-pack-1";
  db.prepare("INSERT INTO users (id) VALUES (?)").run(userId);
  return { db, userId };
}

describe("action-sfx-pack", () => {
  it("stores a full pack, prefers clip lookup, and survives backup restore", async () => {
    const { db, userId } = createPackTestDb();
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response(tinyWav, {
        status: 200,
        headers: { "content-type": "audio/wav" },
      });
    };

    const summary = await generateActionSfxPack({
      db,
      userId,
      ownerKind: "bot",
      botId: "bot-alpha",
      ownerLabel: "Alpha",
      personaSnippet: "dry wit, mid-aged",
      apiKey: "test-key",
      fetchImpl,
    });

    assert.equal(calls, ACTION_SFX_PACK_CLIP_COUNT);
    assert.equal(summary.clipCount, ACTION_SFX_PACK_CLIP_COUNT);
    assert.equal(summary.kinds.length, ACTION_SFX_PACK_KINDS.length);

    const laugh = getActionSfxPackClip(
      db,
      userId,
      "bot",
      "bot-alpha",
      "laugh",
      1,
    );
    assert.ok(laugh);
    assert.equal(laugh.contentType, "audio/wav");
    assert.ok(laugh.audioBytes.length > 0);

    const pack = getActionSfxPackSummary(db, userId, "bot", "bot-alpha");
    assert.ok(pack);
    assert.equal(pack.clipCount, ACTION_SFX_PACK_CLIP_COUNT);

    const backupClips = listActionSfxPackClipsForBackup(db, userId);
    assert.equal(backupClips.length, ACTION_SFX_PACK_CLIP_COUNT);

    const restored = createPackTestDb();
    restoreActionSfxPackClipsFromBackup(
      restored.db,
      restored.userId,
      backupClips,
    );
    assert.equal(
      getActionSfxPackSummary(restored.db, restored.userId, "bot", "bot-alpha")
        ?.clipCount,
      ACTION_SFX_PACK_CLIP_COUNT,
    );

    const next = await generateActionSfxPack({
      db,
      userId,
      ownerKind: "bot",
      botId: "bot-alpha",
      ownerLabel: "Alpha",
      apiKey: "test-key",
      fetchImpl,
    });
    assert.notEqual(next.packGenerationId, summary.packGenerationId);
    assert.equal(
      getActionSfxPackSummary(db, userId, "bot", "bot-alpha")?.clipCount,
      ACTION_SFX_PACK_CLIP_COUNT,
    );
  });

  it("keeps packs out of Marketplace bot export SQL", () => {
    const marketplace = readFileSync(
      fileURLToPath(new URL("../prism-marketplace.ts", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(marketplace, /action_sfx_pack/u);
  });

  it("wires backup export/import and generate routes", () => {
    const backup = readFileSync(
      fileURLToPath(new URL("../backup.ts", import.meta.url)),
      "utf8",
    );
    assert.match(backup, /actionSfxPacks:\s*listActionSfxPackClipsForBackup/u);
    assert.match(backup, /restoreActionSfxPackClipsFromBackup/u);

    const server = readFileSync(
      fileURLToPath(new URL("../server.ts", import.meta.url)),
      "utf8",
    );
    assert.match(server, /route\("GET", "\/api\/action-sfx-pack"/u);
    assert.match(server, /route\("GET", "\/api\/action-sfx-pack\/clip"/u);
    assert.match(server, /route\("POST", "\/api\/action-sfx-pack\/generate"/u);
    assert.match(server, /x-prism-action-sfx-pack-progress/u);
  });
});
