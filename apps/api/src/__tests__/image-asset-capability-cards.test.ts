import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../db.ts";
import {
  ItemCapabilityCardError,
  analyzeItemCapabilityCard,
  disableItemCapabilityCard,
  getItemCapabilityCard,
  listReadyWhodunnitItemCapabilityCandidates,
  retryItemCapabilityCard,
  updateItemCapabilityCard,
} from "../image-asset-capability-cards.ts";
import {
  listImageAssetCatalog,
  synchronizeImageAssetCatalog,
} from "../image-asset-library.ts";

const NOW = "2026-08-30T12:00:00.000Z";
const LATER = "2026-08-30T12:01:00.000Z";
const HASH = "a".repeat(64);

function makeDb(): DatabaseSync {
  return initializeDatabase(new DatabaseSync(":memory:"));
}

function seedUser(db: DatabaseSync, id: string): void {
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt, wrapped_user_key,
        wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'key', 'iv', 'tag', ?, ?)`,
  ).run(id, `${id}@example.test`, id, NOW, NOW);
}

function seedImage(
  db: DatabaseSync,
  input: {
    id: string;
    userId: string;
    purpose: "signal_item" | "debate_exhibit" | "gallery";
    title: string;
    contentSha256?: string;
  },
): void {
  const origin =
    input.purpose === "signal_item"
      ? "signal_item"
      : input.purpose === "debate_exhibit"
        ? "debate"
        : "images_panel";
  db.prepare(
    `INSERT INTO images
       (id, user_id, origin, prompt, url, provider, model, purpose,
        local_rel_path, content_sha256, created_at)
     VALUES (?, ?, ?, ?, ?, 'upload', 'upload', ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.userId,
    origin,
    input.title,
    `/api/images/${input.id}`,
    input.purpose,
    `generated-images/${input.userId}/${input.id}.png`,
    input.contentSha256 ?? null,
    NOW,
  );
}

function setIdForImage(
  db: DatabaseSync,
  userId: string,
  imageId: string,
): string {
  synchronizeImageAssetCatalog(db, userId);
  const row = db
    .prepare(
      `SELECT sets.id
         FROM image_asset_sets sets
         JOIN image_asset_set_items items ON items.set_id = sets.id
        WHERE sets.user_id = ? AND items.image_id = ?`,
    )
    .get(userId, imageId) as { id: string };
  return row.id;
}

function completeDraft(
  identity: string,
  primaryArchetype: "key" | "blade",
  confidence = 0.96,
) {
  return {
    exactIdentity: identity,
    whatItDoes:
      primaryArchetype === "key"
        ? "Opens a paired destination rather than firing projectiles."
        : "Cuts materials with a long energized edge.",
    primaryArchetype,
    capabilities: [
      {
        id: primaryArchetype === "key" ? "opens_portal" : "cuts",
        description:
          primaryArchetype === "key"
            ? "Opens a portal to a selected destination."
            : "Cuts through solid materials.",
      },
    ],
    limitations:
      primaryArchetype === "key" ? ["Requires compatible portal coordinates."] : [],
    settingTags: primaryArchetype === "key" ? ["science fiction"] : ["fantasy"],
    genreTags: primaryArchetype === "key" ? ["sci-fi"] : ["space opera"],
    confidence,
  };
}

describe("Item capability cards", () => {
  it("adds independent pending cards to Item and Debate exhibit asset sets", () => {
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedImage(db, {
        id: "item-1",
        userId: "user-1",
        purpose: "signal_item",
        title: "Rick's Portal Gun",
      });
      seedImage(db, {
        id: "exhibit-1",
        userId: "user-1",
        purpose: "debate_exhibit",
        title: "Red lightsaber",
      });
      seedImage(db, {
        id: "general-1",
        userId: "user-1",
        purpose: "gallery",
        title: "Mountain panorama",
      });

      const item = listImageAssetCatalog(db, "user-1", { kind: "item" }).assets[0]!;
      const exhibit = listImageAssetCatalog(db, "user-1", {
        kind: "debate_exhibit",
      }).assets[0]!;
      const general = listImageAssetCatalog(db, "user-1", {
        kind: "general_image",
      }).assets[0]!;

      assert.equal(item.capabilityCard?.status, "pending");
      assert.equal(exhibit.capabilityCard?.status, "pending");
      assert.equal(general.capabilityCard, null);
      assert.equal(
        Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM image_asset_item_capability_cards",
              )
              .get() as { count: number | bigint }
          ).count,
        ),
        2,
      );
    } finally {
      db.close();
    }
  });

  it("keeps unavailable analysis pending and enforces exact privacy lanes", async () => {
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedImage(db, {
        id: "item-1",
        userId: "user-1",
        purpose: "signal_item",
        title: "Rick's Portal Gun",
      });
      const setId = setIdForImage(db, "user-1", "item-1");

      const unavailable = await analyzeItemCapabilityCard(db, "user-1", setId, {
        lane: "local",
        analyzer: null,
        now: NOW,
      });
      assert.equal(unavailable.reason, "analyzer_unavailable");
      assert.equal(unavailable.card.status, "pending");

      let invoked = 0;
      await assert.rejects(
        () =>
          analyzeItemCapabilityCard(db, "user-1", setId, {
            lane: "local",
            analyzer: {
              lane: "online",
              analyzerId: "remote-test",
              async analyze() {
                invoked += 1;
                return completeDraft("Portal Gun", "key");
              },
            },
          }),
        (error: unknown) =>
          error instanceof ItemCapabilityCardError &&
          error.code === "privacy_lane",
      );
      assert.equal(invoked, 0);
      assert.equal(getItemCapabilityCard(db, "user-1", setId)?.status, "pending");
    } finally {
      db.close();
    }
  });

  it("accepts ready cards from both rails and excludes low-confidence, malformed, and disabled cards", async () => {
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedImage(db, {
        id: "item-1",
        userId: "user-1",
        purpose: "signal_item",
        title: "Rick's Portal Gun",
      });
      seedImage(db, {
        id: "exhibit-1",
        userId: "user-1",
        purpose: "debate_exhibit",
        title: "Red lightsaber",
      });
      const itemSetId = setIdForImage(db, "user-1", "item-1");
      const exhibitSetId = setIdForImage(db, "user-1", "exhibit-1");
      const localAnalyzer = (
        identity: string,
        archetype: "key" | "blade",
        confidence = 0.96,
      ) => ({
        lane: "local" as const,
        analyzerId: "local-test",
        model: "fixture",
        async analyze() {
          return completeDraft(identity, archetype, confidence);
        },
      });

      const itemResult = await analyzeItemCapabilityCard(
        db,
        "user-1",
        itemSetId,
        { lane: "local", analyzer: localAnalyzer("Rick's Portal Gun", "key") },
      );
      const lowConfidence = await analyzeItemCapabilityCard(
        db,
        "user-1",
        exhibitSetId,
        {
          lane: "local",
          analyzer: localAnalyzer("Red lightsaber", "blade", 0.42),
        },
      );
      assert.equal(itemResult.card.status, "ready");
      assert.equal(itemResult.card.primaryArchetype, "key");
      assert.equal(lowConfidence.card.status, "needs_review");
      assert.deepEqual(
        listReadyWhodunnitItemCapabilityCandidates(db, "user-1").map(
          (candidate) => candidate.kind,
        ),
        ["item"],
      );

      const retried = await retryItemCapabilityCard(db, "user-1", exhibitSetId, {
        lane: "local",
        analyzer: localAnalyzer("Red lightsaber", "blade"),
      });
      assert.equal(retried.reason, "ready");
      assert.deepEqual(
        new Set(
          listReadyWhodunnitItemCapabilityCandidates(db, "user-1").map(
            (candidate) => candidate.kind,
          ),
        ),
        new Set(["item", "debate_exhibit"]),
      );

      await retryItemCapabilityCard(db, "user-1", exhibitSetId, {
        lane: "local",
        analyzer: {
          lane: "local",
          analyzerId: "malformed-test",
          async analyze() {
            return { primaryArchetype: "spaceship" };
          },
        },
      });
      assert.equal(
        getItemCapabilityCard(db, "user-1", exhibitSetId)?.status,
        "needs_review",
      );

      const disabled = disableItemCapabilityCard(db, "user-1", itemSetId, LATER);
      assert.equal(disabled.status, "disabled");
      assert.deepEqual(
        listReadyWhodunnitItemCapabilityCandidates(db, "user-1"),
        [],
      );
    } finally {
      db.close();
    }
  });

  it("preserves player edits through catalog synchronization and isolates identical bytes by tenant", async () => {
    const db = makeDb();
    try {
      seedUser(db, "user-1");
      seedUser(db, "user-2");
      seedImage(db, {
        id: "u1-item",
        userId: "user-1",
        purpose: "signal_item",
        title: "Unlabeled prop",
        contentSha256: HASH,
      });
      seedImage(db, {
        id: "u2-item",
        userId: "user-2",
        purpose: "signal_item",
        title: "Same bytes, other tenant",
        contentSha256: HASH,
      });
      const user1SetId = setIdForImage(db, "user-1", "u1-item");
      const user2SetId = setIdForImage(db, "user-2", "u2-item");
      assert.notEqual(user1SetId, user2SetId);

      const edited = updateItemCapabilityCard(
        db,
        "user-1",
        user1SetId,
        completeDraft("Rick's Portal Gun", "key"),
        NOW,
      );
      assert.equal(edited.status, "ready");
      assert.equal(edited.confidence, 1);
      assert.equal(edited.playerEdited, true);

      let backgroundInvocations = 0;
      const preserved = await analyzeItemCapabilityCard(db, "user-1", user1SetId, {
        lane: "local",
        analyzer: {
          lane: "local",
          analyzerId: "background-test",
          async analyze() {
            backgroundInvocations += 1;
            return completeDraft("Wrong replacement", "blade");
          },
        },
      });
      assert.equal(preserved.reason, "player_edit_preserved");
      assert.equal(backgroundInvocations, 0);

      synchronizeImageAssetCatalog(db, "user-1");
      const afterSync = listImageAssetCatalog(db, "user-1", {
        kind: "item",
      }).assets[0]!.capabilityCard!;
      assert.equal(afterSync.exactIdentity, "Rick's Portal Gun");
      assert.equal(afterSync.whatItDoes, edited.whatItDoes);
      assert.equal(afterSync.playerEdited, true);

      assert.equal(
        getItemCapabilityCard(db, "user-2", user1SetId, {
          createPending: false,
        }),
        null,
      );
      const user2Card = updateItemCapabilityCard(
        db,
        "user-2",
        user2SetId,
        completeDraft("Plain brass key", "key"),
      );
      assert.equal(user2Card.exactIdentity, "Plain brass key");
      assert.equal(
        getItemCapabilityCard(db, "user-1", user1SetId)?.exactIdentity,
        "Rick's Portal Gun",
      );
    } finally {
      db.close();
    }
  });
});
