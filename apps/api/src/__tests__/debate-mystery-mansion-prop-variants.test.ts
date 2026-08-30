import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { WHODUNNIT_PROP_ARCHETYPE_IDS_V1 } from "@localai/shared";
import sharp from "sharp";
import {
  cloneDebateMysteryMansionBundleV1,
  createBlankDebateMysteryMansionBundleV1,
  deleteDebateMysteryMansionBundleV2,
  freezeDebateMysteryMansionSnapshotV2,
  getDebateMysteryMansionBundleV2,
} from "../debate-mystery-mansion-bundles.ts";
import {
  beginDebateMysteryMansionPropVariantAttemptV1,
  ensureDebateMysteryMansionPropVariantsV1,
  failDebateMysteryMansionPropVariantAttemptV1,
  getDebateMysteryMansionPropThemeStateV1,
  retryDebateMysteryMansionPropVariantV1,
  saveReadyDebateMysteryMansionPropVariantV1,
} from "../debate-mystery-mansion-prop-variants.ts";
import { initializeDatabase } from "../db.ts";

const NOW = "2026-08-30T00:00:00.000Z";
const KEY = Buffer.alloc(32, 19);

function fixture(): { db: DatabaseSync; bundleId: string } {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  const insertUser = db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        preferred_provider, created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'cipher', 'iv', 'tag', 'local', ?, ?)`,
  );
  insertUser.run("owner", "owner@example.com", "Owner", NOW, NOW);
  insertUser.run("other", "other@example.com", "Other", NOW, NOW);
  return { db, bundleId: createBlankDebateMysteryMansionBundleV1(db, "owner").id };
}

async function alphaProp(index: number): Promise<Buffer> {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: {
        r: (index * 31) % 255,
        g: (index * 67) % 255,
        b: (index * 101) % 255,
        alpha: 0.62,
      },
    },
  }).png().toBuffer();
}

async function saveVariant(
  db: DatabaseSync,
  bundleId: string,
  archetypeIndex: number,
  bytes?: Buffer,
): Promise<void> {
  const archetypeId = WHODUNNIT_PROP_ARCHETYPE_IDS_V1[archetypeIndex]!;
  await saveReadyDebateMysteryMansionPropVariantV1(db, KEY, "owner", bundleId, {
    archetypeId,
    displayName: `Theme ${archetypeId}`,
    appearanceDescription: `An isolated transparent ${archetypeId} from the mansion theme.`,
    bytes: bytes ?? await alphaProp(archetypeIndex + 1),
    mimeType: "image/png",
    provider: "fixture",
    model: "fixture-v1",
  });
}

describe("Whodunnit mansion prop variant persistence", () => {
  it("materializes exactly 16 tenant-scoped pending roles", () => {
    const { db, bundleId } = fixture();
    const progress = ensureDebateMysteryMansionPropVariantsV1(db, "owner", bundleId);
    assert.equal(progress.totalCount, 16);
    assert.equal(progress.pendingCount, 16);
    assert.equal(progress.readyCount, 0);
    assert.equal(progress.failedCount, 0);
    assert.equal(progress.complete, false);
    assert.deepEqual(
      progress.variants.map((variant) => variant.archetypeId),
      WHODUNNIT_PROP_ARCHETYPE_IDS_V1,
    );
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_prop_variants WHERE user_id = 'owner'",
    ).get() as { count: number }).count, 16);
    assert.throws(
      () => getDebateMysteryMansionPropThemeStateV1(db, "other", bundleId),
      /not found/iu,
    );
  });

  it("bounds automatic failures at two attempts and requires explicit Retry", async () => {
    const { db, bundleId } = fixture();
    assert.equal(beginDebateMysteryMansionPropVariantAttemptV1(
      db, "owner", bundleId, "key",
    ), 1);
    let progress = failDebateMysteryMansionPropVariantAttemptV1(
      db, "owner", bundleId, "key", "provider timeout",
    );
    assert.equal(progress.variants[0]?.status, "pending");
    assert.equal(progress.variants[0]?.attemptCount, 1);
    assert.equal(beginDebateMysteryMansionPropVariantAttemptV1(
      db, "owner", bundleId, "key",
    ), 2);
    progress = failDebateMysteryMansionPropVariantAttemptV1(
      db, "owner", bundleId, "key", "review rejected",
    );
    assert.equal(progress.variants[0]?.status, "failed");
    assert.equal(progress.variants[0]?.attemptCount, 2);
    assert.equal(progress.variants[0]?.failureCode, "review_rejected");
    assert.throws(
      () => beginDebateMysteryMansionPropVariantAttemptV1(
        db, "owner", bundleId, "key",
      ),
      /Retry/iu,
    );
    await assert.rejects(
      saveReadyDebateMysteryMansionPropVariantV1(db, KEY, "owner", bundleId, {
        archetypeId: "key",
        displayName: "Premature key",
        appearanceDescription: "Artwork cannot bypass the exhausted retry gate.",
        bytes: await alphaProp(44),
        mimeType: "image/png",
      }),
      /Retry/iu,
    );
    progress = retryDebateMysteryMansionPropVariantV1(
      db, "owner", bundleId, "key",
    );
    assert.equal(progress.variants[0]?.status, "pending");
    assert.equal(progress.variants[0]?.attemptCount, 0);
    assert.equal(progress.variants[0]?.failureCode, null);
  });

  it("rejects opaque art, deduplicates bytes, and projects only distinct 16/16 alpha assets", async () => {
    const { db, bundleId } = fixture();
    const opaque = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 12, g: 24, b: 48 },
      },
    }).png().toBuffer();
    await assert.rejects(
      saveReadyDebateMysteryMansionPropVariantV1(db, KEY, "owner", bundleId, {
        archetypeId: "key",
        displayName: "Opaque key",
        appearanceDescription: "A key without an alpha channel.",
        bytes: opaque,
        mimeType: "image/png",
      }),
      /transparent alpha/iu,
    );

    const shared = await alphaProp(91);
    await saveVariant(db, bundleId, 0, shared);
    await saveVariant(db, bundleId, 1, shared);
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_assets WHERE user_id = 'owner'",
    ).get() as { count: number }).count, 1);
    for (let index = 2; index < WHODUNNIT_PROP_ARCHETYPE_IDS_V1.length; index += 1) {
      await saveVariant(db, bundleId, index);
    }
    let bundle = getDebateMysteryMansionBundleV2(db, "owner", bundleId);
    assert.equal(bundle.propTheme, null, "one shared sprite cannot satisfy 16-asset cardinality");
    assert.equal(bundle.propThemeProgress?.readyCount, 16);
    assert.equal(bundle.propThemeProgress?.complete, false);

    await saveVariant(db, bundleId, 1, await alphaProp(92));
    bundle = getDebateMysteryMansionBundleV2(db, "owner", bundleId);
    assert.equal(bundle.propTheme?.variants.length, 16);
    assert.equal(bundle.propThemeProgress?.complete, true);
    assert.equal(new Set(bundle.propTheme?.variants.map((variant) => variant.packageAssetId)).size, 16);
    const snapshot = freezeDebateMysteryMansionSnapshotV2(bundle, NOW);
    assert.equal(snapshot.presentation.propTheme?.variants.length, 16);
    assert.equal(
      snapshot.presentation.assets.filter((asset) => asset.logicalId.startsWith("theme:")).length,
      16,
    );
  });

  it("keeps partial sprites out of snapshots and preserves variants through clone and cleanup", async () => {
    const { db, bundleId } = fixture();
    await saveVariant(db, bundleId, 0);
    const partial = getDebateMysteryMansionBundleV2(db, "owner", bundleId);
    assert.equal(partial.propTheme, null);
    assert.equal(partial.propThemeProgress?.readyCount, 1);
    assert.equal(
      freezeDebateMysteryMansionSnapshotV2(partial, NOW).presentation.assets
        .some((asset) => asset.logicalId.startsWith("theme:")),
      false,
    );

    const clone = cloneDebateMysteryMansionBundleV1(db, "owner", bundleId);
    assert.equal(clone.propThemeProgress?.readyCount, 1);
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_assets WHERE user_id = 'owner'",
    ).get() as { count: number }).count, 1);
    deleteDebateMysteryMansionBundleV2(db, "owner", bundleId);
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_assets WHERE user_id = 'owner'",
    ).get() as { count: number }).count, 1, "the clone still owns the content-addressed sprite");
    deleteDebateMysteryMansionBundleV2(db, "owner", clone.id);
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_assets WHERE user_id = 'owner'",
    ).get() as { count: number }).count, 0);
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_prop_variants WHERE user_id = 'owner'",
    ).get() as { count: number }).count, 0);
  });

  it("cascades protected variant rows during account deletion", async () => {
    const { db, bundleId } = fixture();
    await saveVariant(db, bundleId, 0);
    db.prepare("DELETE FROM debate_mystery_mansion_bundles WHERE user_id = ?").run("owner");
    db.prepare("DELETE FROM users WHERE id = ?").run("owner");
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_prop_variants WHERE user_id = 'owner'",
    ).get() as { count: number }).count, 0);
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_assets WHERE user_id = 'owner'",
    ).get() as { count: number }).count, 0);
  });
});
