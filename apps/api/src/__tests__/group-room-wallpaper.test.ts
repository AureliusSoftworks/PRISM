import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import {
  composeGroupRoomWallpaperPrompt,
  groupRoomWallpaperVariationBrief,
  loadOwnedGroupRoomWallpaperMembers,
  normalizeGroupRoomWallpaperBackupPrompt,
  normalizeGroupRoomWallpaperBackupUpload,
  readGroupRoomWallpaperRequestContext,
} from "../group-room-wallpaper.ts";

function createBotDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      color TEXT
    );
  `);
  const insert = db.prepare(
    "INSERT INTO bots (id, user_id, name, system_prompt, color) VALUES (?, ?, ?, ?, ?)"
  );
  insert.run("bot-a", "user-1", "Ada", "A patient systems thinker who loves observatories.", "#ABCDEF");
  insert.run("bot-b", "user-1", "Bram", "A playful urban gardener and careful listener.", "oklch(70% 0.2 120)");
  insert.run("bot-c", "user-2", "Cora", "A bot from another account.", "#ff0000");
  return db;
}

describe("group-room wallpaper request validation", () => {
  it("normalizes bounded group fields and 2-24 unique member IDs", () => {
    const context = readGroupRoomWallpaperRequestContext({
      groupName: "  Night   Shift  ",
      groupDescription: "  Friends\nwho think after midnight. ",
      memberBotIds: [" bot-a ", "bot-b"],
    });
    assert.deepEqual(context, {
      groupName: "Night Shift",
      groupDescription: "Friends who think after midnight.",
      memberBotIds: ["bot-a", "bot-b"],
    });

    const maximum = readGroupRoomWallpaperRequestContext({
      groupName: "Full room",
      memberBotIds: Array.from({ length: 24 }, (_, index) => `bot-${index}`),
    });
    assert.equal(maximum.memberBotIds.length, 24);

    assert.deepEqual(
      readGroupRoomWallpaperRequestContext({
        groupName: "Night Shift",
        memberBotIds: ["bot-a", "bot-b"],
        variationSeed: "  attempt-2  ",
      }),
      {
        groupName: "Night Shift",
        groupDescription: "",
        memberBotIds: ["bot-a", "bot-b"],
        variationSeed: "attempt-2",
      },
    );
  });

  it("rejects undersized, duplicate, and overlong group context", () => {
    assert.throws(
      () =>
        readGroupRoomWallpaperRequestContext({
          groupName: "Solo",
          memberBotIds: ["bot-a"],
        }),
      /requires 2-24/u
    );
    assert.throws(
      () =>
        readGroupRoomWallpaperRequestContext({
          groupName: "Duplicates",
          memberBotIds: ["bot-a", " bot-a "],
        }),
      /unique/u
    );
    assert.throws(
      () =>
        readGroupRoomWallpaperRequestContext({
          groupName: "x".repeat(81),
          memberBotIds: ["bot-a", "bot-b"],
        }),
      /80 characters or fewer/u
    );
    assert.throws(
      () =>
        readGroupRoomWallpaperRequestContext({
          groupName: "Long description",
          groupDescription: "x".repeat(501),
          memberBotIds: ["bot-a", "bot-b"],
        }),
      /500 characters or fewer/u
    );
    assert.throws(
      () =>
        readGroupRoomWallpaperRequestContext({
          groupName: "Night Shift",
          memberBotIds: ["bot-a", "bot-b"],
          variationSeed: "x".repeat(161),
        }),
      /Variation seed must be 160 characters or fewer/u,
    );
    assert.throws(
      () =>
        readGroupRoomWallpaperRequestContext({
          groupName: "Too full",
          memberBotIds: Array.from({ length: 25 }, (_, index) => `bot-${index}`),
        }),
      /requires 2-24/u
    );
  });
});

describe("group-room wallpaper backup uploads", () => {
  it("validates and normalizes a bounded PNG without any provider call", async () => {
    const source = await sharp({
      create: {
        width: 8,
        height: 5,
        channels: 4,
        background: { r: 20, g: 30, b: 40, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const normalized = await normalizeGroupRoomWallpaperBackupUpload(
      `data:image/png;base64,${source.toString("base64")}`,
    );
    assert.equal(normalized.width, 8);
    assert.equal(normalized.height, 5);
    assert.equal((await sharp(normalized.pngBytes).metadata()).format, "png");
    assert.equal(
      normalizeGroupRoomWallpaperBackupPrompt("  Quiet\nobservatory  "),
      "Quiet observatory",
    );
  });

  it("accepts JPEG uploads and normalizes them to PNG", async () => {
    const source = await sharp({
      create: {
        width: 9,
        height: 6,
        channels: 3,
        background: { r: 54, g: 68, b: 82 },
      },
    })
      .jpeg()
      .toBuffer();
    const normalized = await normalizeGroupRoomWallpaperBackupUpload(
      `data:image/jpeg;base64,${source.toString("base64")}`,
    );
    assert.equal(normalized.width, 9);
    assert.equal(normalized.height, 6);
    assert.equal((await sharp(normalized.pngBytes).metadata()).format, "png");
  });

  it("rejects unsupported and unreadable upload data", async () => {
    await assert.rejects(
      normalizeGroupRoomWallpaperBackupUpload(
        "data:image/gif;base64,aGVsbG8=",
      ),
      /must be a PNG, JPEG, or WebP data URL/u,
    );
    await assert.rejects(
      normalizeGroupRoomWallpaperBackupUpload(
        "data:image/png;base64,aGVsbG8=",
      ),
      /could not be read/u,
    );
  });

  it("reports post-rotation dimensions for restored image metadata", async () => {
    const oriented = await sharp({
      create: {
        width: 8,
        height: 5,
        channels: 4,
        background: { r: 20, g: 30, b: 40, alpha: 1 },
      },
    })
      .withMetadata({ orientation: 6 })
      .png()
      .toBuffer();
    const normalized = await normalizeGroupRoomWallpaperBackupUpload(
      `data:image/png;base64,${oriented.toString("base64")}`,
    );
    assert.equal(normalized.width, 5);
    assert.equal(normalized.height, 8);
  });
});

describe("group-room wallpaper trusted prompt context", () => {
  it("loads owned bot identity, color, and bounded persona cues in request order", () => {
    const db = createBotDb();
    const members = loadOwnedGroupRoomWallpaperMembers(db, "user-1", ["bot-b", "bot-a"]);
    assert.deepEqual(
      members.map((member) => [member.id, member.name, member.color]),
      [
        ["bot-b", "Bram", "oklch(70% 0.2 120)"],
        ["bot-a", "Ada", "#abcdef"],
      ]
    );
    assert.match(members[0]!.personaExcerpt, /urban gardener/u);
    assert.match(members[1]!.personaExcerpt, /observatories/u);
  });

  it("rejects missing and cross-account bots", () => {
    const db = createBotDb();
    assert.throws(
      () => loadOwnedGroupRoomWallpaperMembers(db, "user-1", ["bot-a", "bot-c"]),
      /owned bot/u
    );
    assert.throws(
      () => loadOwnedGroupRoomWallpaperMembers(db, "user-1", ["bot-a", "missing"]),
      /owned bot/u
    );
  });

  it("composes a center-safe widescreen prompt from trusted members and Zen style notes", () => {
    const prompt = composeGroupRoomWallpaperPrompt({
      userPrompt: "A rain-lit observatory above the city",
      groupName: "Night Shift",
      groupDescription: "Friends who think best after midnight.",
      members: [
        { id: "bot-a", name: "Ada", color: "#abcdef", personaExcerpt: "Patient systems thinker." },
        { id: "bot-b", name: "Bram", color: "#123456", personaExcerpt: "Playful urban gardener." },
      ],
      zenWallpaperStyleNotes: "Soft grain and restrained neon.",
      variationSeed: "night-shift-attempt-1",
    });
    assert.match(prompt, /widescreen 16:9/u);
    assert.match(prompt, /Group: Night Shift/u);
    assert.match(prompt, /#abcdef, #123456/u);
    assert.match(prompt, /Ada; accent #abcdef; atmosphere cues: Patient systems thinker/u);
    assert.match(prompt, /Global Zen atmosphere style preference: Soft grain/u);
    assert.match(prompt, /Variation brief for this generation \(mandatory\):/u);
    assert.match(prompt, /No readable words/u);
    assert.match(prompt, /exact center/u);
  });

  it("selects stable but meaningfully different generation briefs", () => {
    const first = groupRoomWallpaperVariationBrief("attempt-1");
    const repeated = groupRoomWallpaperVariationBrief("attempt-1");
    const variants = new Set(
      Array.from({ length: 12 }, (_, index) =>
        groupRoomWallpaperVariationBrief(`attempt-${index}`),
      ),
    );

    assert.equal(repeated, first);
    assert.ok(first);
    assert.ok(variants.size >= 8);
    assert.equal(groupRoomWallpaperVariationBrief(" "), null);
  });
});
