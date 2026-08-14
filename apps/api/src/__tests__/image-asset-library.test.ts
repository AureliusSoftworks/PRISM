import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../db.ts";
import {
  ImageAssetLibraryError,
  imageAssetSelectionStorageBytes,
  imageAssetStorageSummary,
  getBotImageAssetLibraryIndex,
  getImageAssetSetForCatalog,
  listImageAssetCatalog,
  rebuildImageBotAssociations,
  synchronizeImageAssetCatalog,
  updateImageAssetPlayerTags,
  deleteUnusedImageAssetSet,
} from "../image-asset-library.ts";
import {
  thumbWebpRelativePathFromPngRelativePath,
  writeGeneratedImageBytes,
} from "../image-storage.ts";

const NOW = "2026-08-03T12:00:00.000Z";

function seedUser(db: DatabaseSync, id: string): void {
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt, wrapped_user_key,
        wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'key', 'iv', 'tag', ?, ?)`,
  ).run(id, `${id}@example.test`, id, NOW, NOW);
}

function seedBot(
  db: DatabaseSync,
  userId: string,
  id: string,
  name: string,
): void {
  db.prepare(
    `INSERT INTO bots (id, user_id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, userId, name, NOW, NOW);
}

function seedImage(
  db: DatabaseSync,
  args: {
    id: string;
    userId: string;
    origin: string;
    purpose: string;
    prompt: string;
    conversationId?: string;
    botId?: string;
    relatedBotIds?: string[];
    provider?: string;
    createdAt?: string;
  },
): void {
  db.prepare(
    `INSERT INTO images
       (id, user_id, conversation_id, bot_id, related_bot_ids, origin, prompt,
        url, provider, model, purpose, local_rel_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, 'test-model', ?, ?, ?)`,
  ).run(
    args.id,
    args.userId,
    args.conversationId ?? null,
    args.botId ?? null,
    JSON.stringify(args.relatedBotIds ?? []),
    args.origin,
    args.prompt,
    args.provider ?? "openai",
    args.purpose,
    `generated-images/${args.userId}/${args.id}.png`,
    args.createdAt ?? NOW,
  );
}

function makeDb(): DatabaseSync {
  return initializeDatabase(new DatabaseSync(":memory:"));
}

describe("local image asset catalog", () => {
  it("idempotently groups only authoritative Signal Light/Dark pairs", () => {
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedBot(db, "user-1", "vader", "Darth Vader");
      for (let index = 1; index <= 4; index += 1) {
        const botId = index === 1 ? "vader" : `vader-${index}`;
        if (index > 1) seedBot(db, "user-1", botId, `Darth Vader ${index}`);
        seedImage(db, {
          id: `day-${index}`,
          userId: "user-1",
          botId,
          origin: "botcast",
          purpose: "signal_studio_day",
          prompt: `Darth Vader studio ${index} in daylight`,
        });
        seedImage(db, {
          id: `night-${index}`,
          userId: "user-1",
          botId,
          origin: "botcast",
          purpose: "signal_studio_night",
          prompt: `Darth Vader studio ${index} after dark`,
        });
        db.prepare(
          `INSERT INTO botcast_shows
             (id, user_id, host_bot_id, name, premise, hosting_style,
              accent_color, atmosphere_json, created_at, updated_at)
           VALUES (?, 'user-1', ?, ?, '', '', '#000000', ?, ?, ?)`,
        ).run(
          `show-${index}`,
          botId,
          `Darth Vader ${index}`,
          JSON.stringify({
            dayAtmosphere: { imageId: `day-${index}` },
            nightAtmosphere: { imageId: `night-${index}` },
          }),
          NOW,
          NOW,
        );
      }
      seedImage(db, {
        id: "unmatched-light",
        userId: "user-1",
        origin: "botcast",
        purpose: "signal_studio_day",
        prompt: "Legacy orphan",
      });

      synchronizeImageAssetCatalog(db, "user-1");
      synchronizeImageAssetCatalog(db, "user-1");

      const page = listImageAssetCatalog(db, "user-1", {
        kind: "signal_studio",
        query: "Darth Vader",
      });
      assert.equal(page.assets.length, 4);
      assert.ok(
        page.assets.every(
          (asset) =>
            asset.status === "ready" &&
            asset.members.some((member) => member.role === "light") &&
            asset.members.some((member) => member.role === "dark"),
        ),
      );
      const contextFirst = listImageAssetCatalog(db, "user-1", {
        kind: "signal_studio",
        context: "Darth Vader 4",
        sort: "recency",
      });
      assert.match(contextFirst.assets[0]?.title ?? "", /Darth Vader 4/iu);
      const unmatched = db
        .prepare(
          `SELECT status, source FROM image_asset_sets sets
             JOIN image_asset_set_items items ON items.set_id = sets.id
            WHERE items.image_id = 'unmatched-light'`,
        )
        .get() as { status: string; source: string };
      assert.equal(unmatched.status, "incomplete");
      assert.equal(unmatched.source, "legacy");
      assert.equal(
        Number(
          (
            db
              .prepare("SELECT COUNT(*) AS count FROM image_asset_set_items")
              .get() as {
              count: number | bigint;
            }
          ).count,
        ),
        9,
      );
    } finally {
      db.close();
    }
  });

  it("keeps search tenant- and kind-isolated and indexes editable tags", () => {
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedUser(db, "user-2");
      seedImage(db, {
        id: "u1-exhibit",
        userId: "user-1",
        origin: "debate",
        purpose: "debate_exhibit",
        prompt: "Alderaan reactor evidence",
      });
      seedImage(db, {
        id: "u1-cover",
        userId: "user-1",
        origin: "slate_cover",
        purpose: "slate_cover",
        prompt: "Alderaan novel cover",
      });
      seedImage(db, {
        id: "u2-exhibit",
        userId: "user-2",
        origin: "debate",
        purpose: "debate_exhibit",
        prompt: "Alderaan private evidence",
      });

      const initial = listImageAssetCatalog(db, "user-1", {
        kind: "debate_exhibit",
        query: "Alderaan",
      });
      assert.equal(initial.assets.length, 1);
      const tagged = updateImageAssetPlayerTags(
        db,
        "user-1",
        initial.assets[0]!.id,
        ["Death Star", "canon"],
      );
      assert.deepEqual(tagged.playerTags, ["Death Star", "canon"]);
      assert.equal(
        listImageAssetCatalog(db, "user-1", {
          kind: "debate_exhibit",
          query: "Death Star",
        }).assets.length,
        1,
      );
      assert.equal(
        listImageAssetCatalog(db, "user-1", {
          kind: "slate_cover",
          query: "Death Star",
        }).assets.length,
        0,
      );
      assert.equal(
        listImageAssetCatalog(db, "user-2", {
          kind: "debate_exhibit",
          query: "Death Star",
        }).assets.length,
        0,
      );
    } finally {
      db.close();
    }
  });

  it("indexes exact owner and participant provenance without fuzzy matching", () => {
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedUser(db, "user-2");
      seedBot(db, "user-1", "alpha", "Alpha");
      seedBot(db, "user-1", "beta", "Beta");
      seedBot(db, "user-2", "other", "Alpha");
      seedImage(db, {
        id: "shared-exhibit",
        userId: "user-1",
        botId: "alpha",
        relatedBotIds: ["alpha", "beta", "other"],
        origin: "debate",
        purpose: "debate_exhibit",
        prompt: "Beta appears only as authored provenance",
      });
      seedImage(db, {
        id: "name-only-exhibit",
        userId: "user-1",
        origin: "debate",
        purpose: "debate_exhibit",
        prompt: "An illustration named Alpha and Beta",
      });

      assert.equal(
        Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM image_bot_associations WHERE user_id = 'user-1' AND image_id = 'shared-exhibit'",
              )
              .get() as { count: number | bigint }
          ).count,
        ),
        2,
        "the image insert trigger should index explicit provenance immediately",
      );

      rebuildImageBotAssociations(db, "user-1");
      rebuildImageBotAssociations(db, "user-1");

      assert.deepEqual(
        (
          db
            .prepare(
              `SELECT bot_id, relation FROM image_bot_associations
                WHERE user_id = 'user-1' AND image_id = 'shared-exhibit'
                ORDER BY bot_id`,
            )
            .all() as Array<{ bot_id: string; relation: string }>
        ).map((row) => ({ ...row })),
        [
          { bot_id: "alpha", relation: "owner" },
          { bot_id: "beta", relation: "participant" },
        ],
      );
      assert.equal(
        Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM image_bot_associations WHERE image_id = 'name-only-exhibit'",
              )
              .get() as { count: number | bigint }
          ).count,
        ),
        0,
      );

      const alpha = listImageAssetCatalog(db, "user-1", {
        kind: "debate_exhibit",
        botId: "alpha",
        query: "authored provenance",
        source: "generated",
        usage: "unused",
      });
      const beta = listImageAssetCatalog(db, "user-1", {
        kind: "debate_exhibit",
        botId: "beta",
      });
      const otherTenant = listImageAssetCatalog(db, "user-2", {
        kind: "debate_exhibit",
        botId: "other",
      });
      assert.equal(alpha.assets.length, 1);
      assert.equal(beta.assets.length, 1);
      assert.equal(otherTenant.assets.length, 0);
      assert.equal(alpha.assets[0]?.id, beta.assets[0]?.id);

      db.prepare(
        "UPDATE images SET related_bot_ids = '[\"alpha\"]' WHERE id = 'shared-exhibit'",
      ).run();
      assert.equal(
        Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM image_bot_associations WHERE image_id = 'shared-exhibit' AND bot_id = 'beta'",
              )
              .get() as { count: number | bigint }
          ).count,
        ),
        0,
        "the provenance update trigger should remove stale links",
      );
      db.prepare("DELETE FROM bots WHERE id = 'alpha' AND user_id = 'user-1'").run();
      assert.equal(
        Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM images WHERE id = 'shared-exhibit'",
              )
              .get() as { count: number | bigint }
          ).count,
        ),
        1,
        "deleting a bot should cascade only its derivative associations",
      );
    } finally {
      db.close();
    }
  });

  it("resolves an exact bot-scoped asset beyond the current catalog page", () => {
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedUser(db, "user-2");
      seedBot(db, "user-1", "alpha", "Alpha");
      seedBot(db, "user-1", "beta", "Beta");
      for (const id of ["older-exhibit", "newer-exhibit"]) {
        seedImage(db, {
          id,
          userId: "user-1",
          botId: "alpha",
          origin: "debate",
          purpose: "debate_exhibit",
          prompt: `${id} with exact authored provenance`,
        });
      }

      const visiblePage = listImageAssetCatalog(db, "user-1", {
        kind: "debate_exhibit",
        botId: "alpha",
        limit: 1,
        sort: "recency",
      });
      const completePage = listImageAssetCatalog(db, "user-1", {
        kind: "debate_exhibit",
        botId: "alpha",
        limit: 2,
        sort: "recency",
      });
      const hiddenAsset = completePage.assets.find(
        (asset) => asset.id !== visiblePage.assets[0]?.id,
      );
      assert.ok(hiddenAsset, "the fixture should include an asset beyond page one");

      assert.equal(
        getImageAssetSetForCatalog(db, "user-1", hiddenAsset.id, {
          kind: "debate_exhibit",
          botId: "alpha",
        })?.id,
        hiddenAsset.id,
      );
      assert.equal(
        getImageAssetSetForCatalog(db, "user-1", hiddenAsset.id, {
          kind: "debate_exhibit",
          botId: "beta",
        }),
        null,
      );
      assert.equal(
        getImageAssetSetForCatalog(db, "user-2", hiddenAsset.id, {
          kind: "debate_exhibit",
          botId: "alpha",
        }),
        null,
      );
      assert.equal(
        getImageAssetSetForCatalog(db, "user-1", hiddenAsset.id, {
          kind: "general_image",
          botId: "alpha",
        }),
        null,
      );
    } finally {
      db.close();
    }
  });

  it("backfills only exact authoritative applet ownership and participation IDs", () => {
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedUser(db, "user-2");
      for (const [id, name] of [
        ["chat-bot", "Chat Bot"],
        ["signal-host", "Signal Host"],
        ["group-a", "Group A"],
        ["group-b", "Group B"],
        ["coffee-a", "Coffee A"],
        ["debate-mod", "Debate Moderator"],
        ["debate-for", "For Advocate"],
        ["debate-against", "Against Advocate"],
        ["debate-juror", "Debate Juror"],
      ] as const) {
        seedBot(db, "user-1", id, name);
      }
      seedBot(db, "user-2", "other-tenant-bot", "Chat Bot");

      seedImage(db, {
        id: "chat-direct",
        userId: "user-1",
        conversationId: "chat-1",
        origin: "images_panel",
        purpose: "gallery",
        prompt: "Legacy Chat image without bot provenance",
      });
      for (const id of ["zen-current", "zen-history", "chat-atmosphere"]) {
        seedImage(db, {
          id,
          userId: "user-1",
          origin: "zen_wallpaper",
          purpose: "wallpaper",
          prompt: `${id} exact pointer`,
        });
      }
      db.prepare(
        `INSERT INTO conversations
           (id, user_id, title, conversation_mode, bot_id,
            zen_wallpaper_image_id, zen_wallpaper_history, created_at, updated_at)
         VALUES ('chat-1', 'user-1', 'Chat', 'chat', 'chat-bot', NULL, '[]', ?, ?),
                ('zen-1', 'user-1', 'Zen', 'zen', 'chat-bot', 'zen-current', ?, ?, ?)`,
      ).run(
        NOW,
        NOW,
        JSON.stringify([{ imageId: "zen-history" }]),
        NOW,
        NOW,
      );
      db.prepare(
        `UPDATE bots
            SET chat_atmosphere_image_id = 'chat-atmosphere'
          WHERE id = 'chat-bot' AND user_id = 'user-1'`,
      ).run();

      for (const [id, purpose] of [
        ["signal-day", "signal_studio_day"],
        ["signal-mask", "signal_microphone_tint_mask"],
        ["signal-logo", "signal_logo"],
      ] as const) {
        seedImage(db, {
          id,
          userId: "user-1",
          origin: "botcast",
          purpose,
          prompt: `${id} exact show pointer`,
        });
      }
      db.prepare(
        `INSERT INTO botcast_shows
           (id, user_id, host_bot_id, name, premise, hosting_style,
            accent_color, atmosphere_json, created_at, updated_at)
         VALUES ('show-1', 'user-1', 'signal-host', 'Signal', '', '', '#000000', ?, ?, ?)`,
      ).run(
        JSON.stringify({
          dayAtmosphere: {
            imageId: "signal-day",
            microphoneTintMaskImageId: "signal-mask",
          },
          logo: { imageId: "signal-logo" },
        }),
        NOW,
        NOW,
      );

      seedImage(db, {
        id: "group-room",
        userId: "user-1",
        origin: "bot_group_room_import",
        purpose: "group-room-wallpaper",
        prompt: "Saved room atmosphere",
      });
      db.prepare(
        `INSERT INTO library_groups
           (id, user_id, name, atmosphere_json, created_at, updated_at)
         VALUES ('club-1', 'user-1', 'Club', ?, ?, ?)`,
      ).run(JSON.stringify({ imageId: "group-room" }), NOW, NOW);
      for (const botId of ["group-a", "group-b", "other-tenant-bot"]) {
        db.prepare(
          `INSERT INTO library_group_members
             (user_id, group_id, bot_id, added_at, updated_at)
           VALUES ('user-1', 'club-1', ?, ?, ?)`,
        ).run(botId, NOW, NOW);
      }

      seedImage(db, {
        id: "coffee-room",
        userId: "user-1",
        origin: "coffee_group",
        purpose: "coffee_atmosphere",
        prompt: "Coffee room atmosphere",
      });
      db.prepare(
        `INSERT INTO coffee_groups
           (id, user_id, name, atmosphere_json, coffee_settings, created_at, updated_at)
         VALUES ('coffee-1', 'user-1', 'Coffee', ?, '{}', ?, ?)`,
      ).run(JSON.stringify({ imageId: "coffee-room" }), NOW, NOW);
      db.prepare(
        `INSERT INTO coffee_group_seats
           (user_id, group_id, seat_index, bot_id, updated_at)
         VALUES ('user-1', 'coffee-1', 0, 'coffee-a', ?),
                ('user-1', 'coffee-1', 1, NULL, ?)`,
      ).run(NOW, NOW);
      db.prepare(
        `INSERT INTO conversations
           (id, user_id, title, conversation_mode, bot_group_ids,
            coffee_absent_bot_ids, coffee_group_id, created_at, updated_at)
         VALUES ('coffee-conversation', 'user-1', 'Coffee', 'coffee', ?, ?,
                 'coffee-1', ?, ?)`,
      ).run(
        JSON.stringify(["coffee-a", "group-a"]),
        JSON.stringify(["group-a"]),
        NOW,
        NOW,
      );
      seedImage(db, {
        id: "coffee-conversation-image",
        userId: "user-1",
        conversationId: "coffee-conversation",
        origin: "coffee",
        purpose: "gallery",
        prompt: "Image made at the Coffee table",
      });

      seedImage(db, {
        id: "debate-exhibit",
        userId: "user-1",
        origin: "debate",
        purpose: "debate_exhibit",
        prompt: "Attached exhibit",
      });
      seedImage(db, {
        id: "name-only",
        userId: "user-1",
        origin: "debate",
        purpose: "debate_exhibit",
        prompt: "Chat Bot and Signal Host appear only in prose",
      });
      seedImage(db, {
        id: "other-tenant-image",
        userId: "user-2",
        botId: "other-tenant-bot",
        origin: "debate",
        purpose: "debate_exhibit",
        prompt: "Private exhibit",
      });
      db.prepare(
        `INSERT INTO debate_sessions
           (id, user_id, status, phase, step_key, player_role,
            create_idempotency_key, motion, session_json, created_at, updated_at)
         VALUES ('debate-1', 'user-1', 'live', 'opening', 'opening', 'spectator',
                 'debate-create-1', 'A motion', ?, ?, ?)`,
      ).run(
        JSON.stringify({
          moderator: { id: "debate-mod" },
          forAdvocate: { id: "debate-for" },
          againstAdvocate: { id: "debate-against" },
          jury: { jurors: [{ id: "debate-juror" }] },
          evidence: {
            exhibits: [
              { id: "exhibit-1", imageId: "debate-exhibit" },
              { id: "exhibit-cross-tenant", imageId: "other-tenant-image" },
            ],
          },
        }),
        NOW,
        NOW,
      );

      rebuildImageBotAssociations(db, "user-1");
      rebuildImageBotAssociations(db, "user-1");

      const associationsFor = (imageId: string) =>
        (
          db
            .prepare(
              `SELECT bot_id, relation
                 FROM image_bot_associations
                WHERE user_id = 'user-1' AND image_id = ?
                ORDER BY bot_id`,
            )
            .all(imageId) as Array<{ bot_id: string; relation: string }>
        ).map((row) => ({ ...row }));
      for (const imageId of [
        "chat-direct",
        "zen-current",
        "zen-history",
        "chat-atmosphere",
      ]) {
        assert.deepEqual(associationsFor(imageId), [
          { bot_id: "chat-bot", relation: "owner" },
        ]);
      }
      for (const imageId of ["signal-day", "signal-mask", "signal-logo"]) {
        assert.deepEqual(associationsFor(imageId), [
          { bot_id: "signal-host", relation: "owner" },
        ]);
      }
      assert.deepEqual(associationsFor("group-room"), [
        { bot_id: "group-a", relation: "participant" },
        { bot_id: "group-b", relation: "participant" },
      ]);
      assert.deepEqual(associationsFor("coffee-room"), [
        { bot_id: "coffee-a", relation: "participant" },
      ]);
      assert.deepEqual(associationsFor("coffee-conversation-image"), [
        { bot_id: "coffee-a", relation: "participant" },
      ]);
      assert.deepEqual(associationsFor("debate-exhibit"), [
        { bot_id: "debate-against", relation: "participant" },
        { bot_id: "debate-for", relation: "participant" },
        { bot_id: "debate-juror", relation: "participant" },
        { bot_id: "debate-mod", relation: "participant" },
      ]);
      assert.deepEqual(associationsFor("name-only"), []);
      assert.deepEqual(associationsFor("other-tenant-image"), []);
      assert.deepEqual(
        (
          db
            .prepare(
              `SELECT bot_id, relation
                 FROM image_bot_associations
                WHERE user_id = 'user-2' AND image_id = 'other-tenant-image'`,
            )
            .all() as Array<{ bot_id: string; relation: string }>
        ).map((row) => ({ ...row })),
        [{ bot_id: "other-tenant-bot", relation: "owner" }],
      );

      db.prepare(
        `DELETE FROM library_group_members
          WHERE user_id = 'user-1' AND group_id = 'club-1' AND bot_id = 'group-b'`,
      ).run();
      rebuildImageBotAssociations(db, "user-1");
      assert.deepEqual(associationsFor("group-room"), [
        { bot_id: "group-a", relation: "participant" },
      ]);
    } finally {
      db.close();
    }
  });

  it("indexes the complete 100-member saved-group cap without dropping bots", () => {
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedImage(db, {
        id: "full-club-room",
        userId: "user-1",
        origin: "bot_group_room_import",
        purpose: "group-room-wallpaper",
        prompt: "Full club room",
      });
      db.prepare(
        `INSERT INTO library_groups
           (id, user_id, name, atmosphere_json, created_at, updated_at)
         VALUES ('club-100', 'user-1', 'Hundred', ?, ?, ?)`,
      ).run(JSON.stringify({ imageId: "full-club-room" }), NOW, NOW);
      for (let index = 0; index < 100; index += 1) {
        const botId = `member-${String(index).padStart(3, "0")}`;
        seedBot(db, "user-1", botId, `Member ${index + 1}`);
        db.prepare(
          `INSERT INTO library_group_members
             (user_id, group_id, bot_id, added_at, updated_at)
           VALUES ('user-1', 'club-100', ?, ?, ?)`,
        ).run(botId, NOW, NOW);
      }

      rebuildImageBotAssociations(db, "user-1");

      const count = db
        .prepare(
          `SELECT COUNT(*) AS count
             FROM image_bot_associations
            WHERE user_id = 'user-1' AND image_id = 'full-club-room'`,
        )
        .get() as { count: number | bigint };
      assert.equal(Number(count.count), 100);
    } finally {
      db.close();
    }
  });

  it("returns nonempty ready bot-library sections with exact totals and recent limits", () => {
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedBot(db, "user-1", "alpha", "Alpha");
      for (let index = 0; index < 4; index += 1) {
        seedImage(db, {
          id: `alpha-${index}`,
          userId: "user-1",
          botId: "alpha",
          origin: "images_panel",
          purpose: "gallery",
          prompt: `Alpha image ${index}`,
          createdAt: `2026-08-03T12:00:0${index}.000Z`,
        });
      }
      seedImage(db, {
        id: "alpha-signal-orphan",
        userId: "user-1",
        botId: "alpha",
        origin: "botcast",
        purpose: "signal_studio_day",
        prompt: "Incomplete studio",
      });

      const index = getBotImageAssetLibraryIndex(db, "user-1", "alpha", 2);
      assert.equal(index.botId, "alpha");
      assert.deepEqual(index.sections.map((section) => section.kind), [
        "general_image",
      ]);
      assert.equal(index.sections[0]?.totalCount, 4);
      assert.equal(index.sections[0]?.assets.length, 2);
      assert.match(index.sections[0]?.assets[0]?.title ?? "", /3/u);
    } finally {
      db.close();
    }
  });

  it("protects used sets and reports the known usage", () => {
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedImage(db, {
        id: "home-1",
        userId: "user-1",
        origin: "hub_atmosphere",
        purpose: "hub_atmosphere",
        prompt: "A quiet amber room",
      });
      db.prepare(
        "UPDATE users SET hub_atmosphere_image_id = 'home-1' WHERE id = 'user-1'",
      ).run();
      const asset = listImageAssetCatalog(db, "user-1", {
        kind: "home_atmosphere",
      }).assets[0]!;
      assert.equal(asset.usageCount, 1);
      assert.equal(asset.usage[0]?.href, "/?view=chat");
      assert.throws(
        () => deleteUnusedImageAssetSet(db, "user-1", asset.id),
        (error: unknown) => {
          assert.ok(error instanceof ImageAssetLibraryError);
          assert.equal(error.code, "in_use");
          assert.equal(
            error.usage[0]?.label,
            "Current Prism session atmosphere",
          );
          assert.equal(error.usage[0]?.href, "/?view=chat");
          return true;
        },
      );
      const storage = imageAssetStorageSummary(db, "user-1");
      assert.equal(storage.totalAssetCount, 1);
      assert.equal(
        storage.byKind.find((entry) => entry.kind === "home_atmosphere")?.count,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("refreshes singleton context after a cataloged asset is reused", () => {
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedImage(db, {
        id: "home-later",
        userId: "user-1",
        origin: "hub_atmosphere",
        purpose: "hub_atmosphere",
        prompt: "Uploaded copper room",
        provider: "upload",
      });
      const before = listImageAssetCatalog(db, "user-1", {
        kind: "home_atmosphere",
      }).assets[0]!;
      assert.equal(before.usageCount, 0);
      db.prepare(
        "UPDATE users SET display_name = 'Leia', hub_atmosphere_image_id = 'home-later' WHERE id = 'user-1'",
      ).run();
      const after = listImageAssetCatalog(db, "user-1", {
        kind: "home_atmosphere",
        query: "Leia",
      }).assets[0]!;
      assert.equal(after.id, before.id);
      assert.equal(after.title, "Prism Session Atmosphere");
      assert.equal(after.usageCount, 1);
    } finally {
      db.close();
    }
  });

  it("counts and protects Slate visual-study references", () => {
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedImage(db, {
        id: "study-1",
        userId: "user-1",
        origin: "slate_visual_bible",
        purpose: "slate_visual_bible",
        prompt: "Alderaan costume study",
      });
      db.prepare(
        `INSERT INTO slate_projects
           (id, user_id, title, spark, created_at, updated_at)
         VALUES ('project-1', 'user-1', 'Alderaan', '', ?, ?)`,
      ).run(NOW, NOW);
      db.prepare(
        `INSERT INTO slate_visual_references
           (id, user_id, project_id, kind, image_id, prompt, provider, model,
            created_at)
         VALUES ('ref-1', 'user-1', 'project-1', 'character_study', 'study-1',
                 'Alderaan costume study', 'local', 'test-model', ?)`,
      ).run(NOW);
      const asset = listImageAssetCatalog(db, "user-1", {
        kind: "slate_visual_study",
      }).assets[0]!;
      assert.equal(asset.usageCount, 1);
      assert.equal(asset.usage[0]?.label, "Slate visual study · Alderaan");
      assert.equal(asset.usage[0]?.href, "/?view=slate");
      assert.throws(
        () => deleteUnusedImageAssetSet(db, "user-1", asset.id),
        (error: unknown) =>
          error instanceof ImageAssetLibraryError && error.code === "in_use",
      );
    } finally {
      db.close();
    }
  });

  it("paginates deterministically and applies source and usage filters before paging", () => {
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      for (let index = 0; index < 7; index += 1) {
        seedImage(db, {
          id: `general-${index}`,
          userId: "user-1",
          origin: "images_panel",
          purpose: "gallery",
          prompt: `Reusable nebula ${index}`,
          provider: index < 3 ? "upload" : "openai",
          createdAt: `2026-08-03T12:00:0${index}.000Z`,
        });
      }
      const first = listImageAssetCatalog(db, "user-1", {
        kind: "general_image",
        limit: 2,
        sort: "recency",
      });
      assert.equal(first.assets.length, 2);
      assert.ok(first.nextCursor);
      const second = listImageAssetCatalog(db, "user-1", {
        kind: "general_image",
        limit: 2,
        sort: "recency",
        cursor: first.nextCursor,
      });
      assert.equal(second.assets.length, 2);
      assert.equal(
        first.assets.some((asset) =>
          second.assets.some((candidate) => candidate.id === asset.id),
        ),
        false,
      );
      const uploaded = listImageAssetCatalog(db, "user-1", {
        kind: "general_image",
        source: "uploaded",
        usage: "unused",
        limit: 2,
      });
      assert.equal(uploaded.assets.length, 2);
      assert.ok(uploaded.nextCursor);
      assert.ok(uploaded.assets.every((asset) => asset.source === "uploaded"));
      const uploadedTail = listImageAssetCatalog(db, "user-1", {
        kind: "general_image",
        source: "uploaded",
        usage: "unused",
        limit: 2,
        cursor: uploaded.nextCursor,
      });
      assert.equal(uploadedTail.assets.length, 1);
      const storage = imageAssetStorageSummary(db, "user-1");
      assert.equal(
        storage.byKind.find((entry) => entry.kind === "general_image")?.count,
        7,
      );
    } finally {
      db.close();
    }
  });

  it("counts visible originals and thumbnails once while preserving tenant scope", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "prism-visible-assets-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDirectory = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDirectory, "localai.db");
    delete process.env.LOCALAI_DATA_DIR;
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedUser(db, "user-2");
      seedImage(db, {
        id: "visible-a",
        userId: "user-1",
        origin: "debate",
        purpose: "debate_exhibit",
        prompt: "Visible exhibit A",
      });
      seedImage(db, {
        id: "visible-b",
        userId: "user-1",
        origin: "debate",
        purpose: "debate_exhibit",
        prompt: "Visible exhibit B",
      });
      seedImage(db, {
        id: "other-tenant",
        userId: "user-2",
        origin: "debate",
        purpose: "debate_exhibit",
        prompt: "Other tenant exhibit",
      });
      synchronizeImageAssetCatalog(db, "user-1");
      synchronizeImageAssetCatalog(db, "user-2");

      const sharedPath = "generated-images/user-1/visible-a.png";
      db.prepare(
        "UPDATE images SET local_rel_path = ? WHERE id = 'visible-b'",
      ).run(sharedPath);
      writeGeneratedImageBytes(sharedPath, Buffer.from("png"));
      writeGeneratedImageBytes(
        thumbWebpRelativePathFromPngRelativePath(sharedPath),
        Buffer.from("webp"),
      );
      const userAssets = listImageAssetCatalog(db, "user-1", {
        kind: "debate_exhibit",
      }).assets;
      const otherTenantAsset = listImageAssetCatalog(db, "user-2", {
        kind: "debate_exhibit",
      }).assets[0]!;

      assert.equal(
        imageAssetSelectionStorageBytes(db, "user-1", [
          ...userAssets.map((asset) => asset.id),
          otherTenantAsset.id,
        ]),
        7,
      );
    } finally {
      db.close();
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
      if (previousDataDirectory === undefined)
        delete process.env.LOCALAI_DATA_DIR;
      else process.env.LOCALAI_DATA_DIR = previousDataDirectory;
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("deletes an unused generated set into recovery without a false failure", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "prism-delete-assets-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDirectory = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDirectory, "localai.db");
    delete process.env.LOCALAI_DATA_DIR;
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedImage(db, {
        id: "unused-room",
        userId: "user-1",
        origin: "bot_group_room",
        purpose: "group-room-wallpaper",
        prompt: "An unused observatory room",
      });
      const relativePath = "generated-images/user-1/unused-room.png";
      writeGeneratedImageBytes(relativePath, Buffer.from("png"));
      writeGeneratedImageBytes(
        thumbWebpRelativePathFromPngRelativePath(relativePath),
        Buffer.from("webp"),
      );
      const asset = listImageAssetCatalog(db, "user-1", {
        kind: "group_room_atmosphere",
      }).assets[0]!;
      assert.equal(asset.usageCount, 0);

      const deleted = deleteUnusedImageAssetSet(db, "user-1", asset.id);

      assert.deepEqual(deleted.imageIds, ["unused-room"]);
      assert.equal(deleted.recoveryBytes, 7);
      assert.equal(
        Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM images WHERE id = 'unused-room'",
              )
              .get() as { count: number | bigint }
          ).count,
        ),
        0,
      );
      assert.equal(
        listImageAssetCatalog(db, "user-1", {
          kind: "group_room_atmosphere",
        }).assets.length,
        0,
      );
    } finally {
      db.close();
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
      if (previousDataDirectory === undefined)
        delete process.env.LOCALAI_DATA_DIR;
      else process.env.LOCALAI_DATA_DIR = previousDataDirectory;
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
