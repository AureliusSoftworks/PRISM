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
  listImageAssetCatalog,
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
      assert.equal(asset.usage[0]?.href, "/?view=chat");
      assert.throws(
        () => deleteUnusedImageAssetSet(db, "user-1", asset.id),
        (error: unknown) => {
          assert.ok(error instanceof ImageAssetLibraryError);
          assert.equal(error.code, "in_use");
          assert.equal(error.usage[0]?.label, "Current Home atmosphere");
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
      assert.equal(after.title, "Home Atmosphere");
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
      if (previousDataDirectory === undefined) delete process.env.LOCALAI_DATA_DIR;
      else process.env.LOCALAI_DATA_DIR = previousDataDirectory;
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
