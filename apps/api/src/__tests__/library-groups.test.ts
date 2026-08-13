import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  importLegacyLibraryGroupsOnce,
  listLibraryGroups,
  replaceLibraryGroups,
  setLibraryFavorites,
  setLibraryMembershipProtection,
} from "../library-groups.ts";
import { deleteBot } from "../bots.ts";
import {
  closeTestDatabase,
  createTestDatabase,
} from "../test-support.ts";

function fixture() {
  const db = createTestDatabase();
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt,
       wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
       created_at, last_active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "u1",
    "library@example.com",
    "Library",
    "hash",
    "salt",
    "cipher",
    "iv",
    "tag",
    "2026-07-26T00:00:00.000Z",
    "2026-07-26T00:00:00.000Z",
  );
  const insertBot = db.prepare(
    `INSERT INTO bots
      (id, user_id, name, created_at, updated_at)
     VALUES (?, 'u1', ?, ?, ?)`,
  );
  insertBot.run("bot-1", "Lux", "2026-07-26T00:00:00.000Z", "2026-07-26T00:00:00.000Z");
  insertBot.run("bot-2", "Umbra", "2026-07-26T00:00:00.000Z", "2026-07-26T00:00:00.000Z");
  return db;
}

describe("server-backed Library groups", () => {
  it("imports browser-local groups once and preserves favorites", () => {
    const db = fixture();
    try {
      const legacy = [
        {
          id: "builtin:favorites",
          name: "Favorites",
          botIds: ["bot-1"],
          deleteProtected: false,
          builtIn: true,
        },
        {
          id: "group:odd-couple",
          name: "Odd Couple",
          description: "An ironic pair.",
          botIds: ["bot-1", "bot-2", "someone-else"],
          deleteProtected: true,
          builtIn: false,
        },
      ];
      const first = importLegacyLibraryGroupsOnce({
        db,
        userId: "u1",
        sourceKey: "browser-local-v1",
        groups: legacy,
      });
      assert.equal(first.imported, true);
      assert.deepEqual(first.groups[0]?.botIds, ["bot-1"]);
      assert.deepEqual(first.groups[1]?.botIds, ["bot-1", "bot-2"]);
      assert.equal(
        (
          db
            .prepare("SELECT delete_protected FROM bots WHERE id = 'bot-2'")
            .get() as { delete_protected: number }
        ).delete_protected,
        1,
      );
      const second = importLegacyLibraryGroupsOnce({
        db,
        userId: "u1",
        sourceKey: "browser-local-v1",
        groups: [],
      });
      assert.equal(second.imported, false);
      assert.equal(second.groups.some((group) => group.id === "group:odd-couple"), true);
    } finally {
      closeTestDatabase(db);
    }
  });

  it("supports membership overrides, favorites, and atomic replacement", () => {
    const db = fixture();
    try {
      replaceLibraryGroups({
        db,
        userId: "u1",
        groups: [
          {
            id: "group:protected",
            name: "Protected",
            botIds: ["bot-1", "bot-2"],
            deleteProtected: true,
          },
        ],
      });
      setLibraryMembershipProtection({
        db,
        userId: "u1",
        groupId: "group:protected",
        botIds: ["bot-2"],
        protected: false,
      });
      const protection = db
        .prepare(
          "SELECT id, delete_protected FROM bots WHERE user_id = 'u1' ORDER BY id",
        )
        .all() as unknown as Array<{ id: string; delete_protected: number }>;
      assert.deepEqual(protection.map((row) => ({ ...row })), [
        { id: "bot-1", delete_protected: 1 },
        { id: "bot-2", delete_protected: 0 },
      ]);

      setLibraryFavorites({
        db,
        userId: "u1",
        botIds: ["bot-1", "bot-2"],
        favorite: true,
      });
      assert.deepEqual(
        listLibraryGroups(db, "u1").find(
          (group) => group.id === "builtin:favorites",
        )?.botIds,
        ["bot-1", "bot-2"],
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("normalizes and persists versioned group glyph identity", () => {
    const db = fixture();
    try {
      replaceLibraryGroups({
        db,
        userId: "u1",
        groups: [
          {
            id: "group:glyph",
            name: "Glyph group",
            botIds: ["bot-1", "bot-2"],
            glyph: { version: 1, seed: "group:glyph:reroll:1" },
          },
          {
            id: "group:invalid-glyph",
            name: "Invalid glyph",
            botIds: ["bot-1", "bot-2"],
            glyph: { version: 2, seed: "not-supported" },
          },
        ],
      });

      const groups = listLibraryGroups(db, "u1");
      assert.deepEqual(
        groups.find((group) => group.id === "group:glyph")?.glyph,
        { version: 1, seed: "group:glyph:reroll:1" },
      );
      assert.equal(
        groups.find((group) => group.id === "group:invalid-glyph")?.glyph,
        undefined,
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("persists one valid leader per group and clears invalid leadership", () => {
    const db = fixture();
    try {
      replaceLibraryGroups({
        db,
        userId: "u1",
        groups: [
          {
            id: "group:club",
            name: "Club",
            botIds: ["bot-1", "bot-2"],
            leaderBotId: "bot-1",
          },
        ],
      });
      assert.equal(
        listLibraryGroups(db, "u1").find(
          (group) => group.id === "group:club",
        )?.leaderBotId,
        "bot-1",
      );

      replaceLibraryGroups({
        db,
        userId: "u1",
        groups: [
          {
            id: "group:club",
            name: "Club",
            botIds: ["bot-1", "bot-2"],
            leaderBotId: "bot-2",
          },
        ],
      });
      assert.equal(
        listLibraryGroups(db, "u1").find(
          (group) => group.id === "group:club",
        )?.leaderBotId,
        "bot-2",
      );

      deleteBot(db, "u1", "bot-2");
      assert.equal(
        listLibraryGroups(db, "u1").find(
          (group) => group.id === "group:club",
        )?.leaderBotId,
        null,
      );

      replaceLibraryGroups({
        db,
        userId: "u1",
        groups: [
          {
            id: "group:club",
            name: "Club",
            botIds: ["bot-1"],
            leaderBotId: "bot-2",
          },
        ],
      });
      assert.equal(
        listLibraryGroups(db, "u1").find(
          (group) => group.id === "group:club",
        )?.leaderBotId,
        null,
      );
    } finally {
      closeTestDatabase(db);
    }
  });
});
