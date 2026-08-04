import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../db.ts";
import {
  ImageAssetLibraryError,
  imageAssetStorageSummary,
  listImageAssetCatalog,
  synchronizeImageAssetCatalog,
  updateImageAssetPlayerTags,
  deleteUnusedImageAssetSet,
} from "../image-asset-library.ts";

const NOW = "2026-08-03T12:00:00.000Z";

function seedUser(db: DatabaseSync, id: string): void {
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt, wrapped_user_key,
        wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'key', 'iv', 'tag', ?, ?)`,
  ).run(id, `${id}@example.test`, id, NOW, NOW);
}

function seedBot(db: DatabaseSync, userId: string, id: string, name: string): void {
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
    botId?: string;
    provider?: string;
    createdAt?: string;
  },
): void {
  db.prepare(
    `INSERT INTO images
       (id, user_id, bot_id, origin, prompt, url, provider, model, purpose,
        local_rel_path, created_at)
     VALUES (?, ?, ?, ?, ?, '', ?, 'test-model', ?, ?, ?)`,
  ).run(
    args.id,
    args.userId,
    args.botId ?? null,
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
            db.prepare("SELECT COUNT(*) AS count FROM image_asset_set_items").get() as {
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
      assert.throws(
        () => deleteUnusedImageAssetSet(db, "user-1", asset.id),
        (error: unknown) => {
          assert.ok(error instanceof ImageAssetLibraryError);
          assert.equal(error.code, "in_use");
          assert.equal(error.usage[0]?.label, "Current Home atmosphere");
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
});
