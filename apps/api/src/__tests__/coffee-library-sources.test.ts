import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COFFEE_LIBRARY_UNGROUPED_SOURCE_ID,
  createCoffeeConversationFromGroup,
  createCoffeeGroup,
  getCoffeeGroup,
  updateCoffeeGroup,
} from "../coffee.ts";
import { replaceLibraryGroups } from "../library-groups.ts";
import { closeTestDatabase, createTestDatabase } from "../test-support.ts";

function fixture() {
  const db = createTestDatabase();
  const now = "2026-08-22T00:00:00.000Z";
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES ('u1', 'coffee@example.com', 'Coffee', 'hash', 'salt', 'cipher', 'iv', 'tag', ?, ?)`,
  ).run(now, now);
  const insertBot = db.prepare(
    `INSERT INTO bots (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
     VALUES (?, 'u1', ?, 'A regular.', '#a355e8', 'waves', 1, ?, ?)`,
  );
  for (const id of ["bot-1", "bot-2", "bot-3", "bot-4", "bot-5"]) {
    insertBot.run(id, id, now, now);
  }
  return db;
}

describe("Coffee Library table sources", () => {
  it("keeps a legacy unlinked table readable", () => {
    const db = fixture();
    try {
      const legacy = createCoffeeGroup(db, "u1", {
        name: "Legacy table",
        groupBotIds: ["bot-1", "bot-2", "bot-3"],
      });
      const loaded = getCoffeeGroup(db, "u1", legacy.id)!;
      assert.equal(loaded.libraryGroupId, null);
      assert.deepEqual(loaded.botGroupIds, ["bot-1", "bot-2", "bot-3"]);
    } finally {
      closeTestDatabase(db);
    }
  });

  it("keeps one table per custom source and resolves later membership changes", () => {
    const db = fixture();
    try {
      replaceLibraryGroups({
        db,
        userId: "u1",
        groups: [{ id: "group:salon", name: "Salon", botIds: ["bot-1", "bot-2", "bot-3"] }],
      });
      const table = createCoffeeGroup(db, "u1", { libraryGroupId: "group:salon" });
      assert.equal(table.libraryGroupId, "group:salon");
      assert.throws(
        () => createCoffeeGroup(db, "u1", { libraryGroupId: "group:salon" }),
        /already exists/i,
      );
      replaceLibraryGroups({
        db,
        userId: "u1",
        groups: [{ id: "group:salon", name: "Salon", botIds: ["bot-1", "bot-3", "bot-4"] }],
      });
      assert.deepEqual(getCoffeeGroup(db, "u1", table.id)?.botGroupIds, ["bot-1", "bot-3", "bot-4"]);
    } finally {
      closeTestDatabase(db);
    }
  });

  it("turns a legacy Library-linked table into a fixed five-seat roster when explicitly edited", () => {
    const db = fixture();
    try {
      replaceLibraryGroups({
        db,
        userId: "u1",
        groups: [{
          id: "group:salon",
          name: "Salon",
          botIds: ["bot-1", "bot-2", "bot-3"],
        }],
      });
      const table = createCoffeeGroup(db, "u1", {
        libraryGroupId: "group:salon",
      });
      const updated = updateCoffeeGroup(db, "u1", table.id, {
        groupBotIds: ["bot-1", null, "bot-4", null, null],
        starterTopics: table.starterTopics,
      });
      assert.equal(updated.libraryGroupId, null);
      assert.deepEqual(updated.botGroupIds, ["bot-1", "bot-4"]);
      assert.deepEqual(updated.coffeeSeatBotIds, [
        "bot-1",
        null,
        "bot-4",
        null,
        null,
      ]);

      replaceLibraryGroups({
        db,
        userId: "u1",
        groups: [{
          id: "group:salon",
          name: "Salon",
          botIds: ["bot-2", "bot-3", "bot-5"],
        }],
      });
      assert.deepEqual(getCoffeeGroup(db, "u1", table.id)?.botGroupIds, [
        "bot-1",
        "bot-4",
      ]);
    } finally {
      closeTestDatabase(db);
    }
  });

  it("dynamically includes newly ungrouped bots and seats a bounded session subset", async () => {
    const db = fixture();
    try {
      replaceLibraryGroups({
        db,
        userId: "u1",
        groups: [{ id: "group:kept", name: "Kept", botIds: ["bot-1"] }],
      });
      const table = createCoffeeGroup(db, "u1", {
        libraryGroupId: COFFEE_LIBRARY_UNGROUPED_SOURCE_ID,
      });
      assert.deepEqual(getCoffeeGroup(db, "u1", table.id)?.botGroupIds, ["bot-2", "bot-3", "bot-4", "bot-5"]);
      db.prepare(
        `INSERT INTO bots (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
         VALUES ('bot-6', 'u1', 'bot-6', 'A new regular.', '#a355e8', 'waves', 1, ?, ?)`,
      ).run("2026-08-23T00:00:00.000Z", "2026-08-23T00:00:00.000Z");
      const refreshed = getCoffeeGroup(db, "u1", table.id)!;
      assert.deepEqual(refreshed.botGroupIds, ["bot-2", "bot-3", "bot-4", "bot-5", "bot-6"]);
      const session = await createCoffeeConversationFromGroup(
        db,
        "u1",
        table.id,
        { forceAttendance: true },
        { attendanceRandom: () => 0 },
      );
      assert.equal(session.conversation.botGroupIds?.length, 4);
    } finally {
      closeTestDatabase(db);
    }
  });

  it("lets an empty linked table wait for enough future members to start", async () => {
    const db = fixture();
    try {
      replaceLibraryGroups({
        db,
        userId: "u1",
        groups: [{
          id: "group:everyone",
          name: "Everyone",
          botIds: ["bot-1", "bot-2", "bot-3", "bot-4", "bot-5"],
        }],
      });
      const table = createCoffeeGroup(db, "u1", {
        libraryGroupId: COFFEE_LIBRARY_UNGROUPED_SOURCE_ID,
      });
      assert.deepEqual(table.botGroupIds, []);
      await assert.rejects(
        () => createCoffeeConversationFromGroup(db, "u1", table.id),
        /at least 2 .*bots/i,
      );

      const insertBot = db.prepare(
        `INSERT INTO bots (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
         VALUES (?, 'u1', ?, 'A new regular.', '#a355e8', 'waves', 1, ?, ?)`,
      );
      insertBot.run("bot-6", "bot-6", "2026-08-23T00:00:00.000Z", "2026-08-23T00:00:00.000Z");
      assert.deepEqual(getCoffeeGroup(db, "u1", table.id)?.botGroupIds, ["bot-6"]);
      await assert.rejects(
        () => createCoffeeConversationFromGroup(db, "u1", table.id),
        /at least 2 .*bots/i,
      );

      insertBot.run("bot-7", "bot-7", "2026-08-24T00:00:00.000Z", "2026-08-24T00:00:00.000Z");
      assert.deepEqual(getCoffeeGroup(db, "u1", table.id)?.botGroupIds, ["bot-6", "bot-7"]);
      const session = await createCoffeeConversationFromGroup(db, "u1", table.id);
      assert.equal(session.conversation.botGroupIds?.length, 2);
    } finally {
      closeTestDatabase(db);
    }
  });
});
