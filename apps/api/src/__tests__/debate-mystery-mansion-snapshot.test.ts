import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  canonicalMansionLayoutV2,
  deriveMansionMusicIdentityV1,
  type DebateMysteryMansionBundleSummaryV1,
  type MansionLayoutV2,
} from "@localai/shared";
import {
  freezeDebateMysteryMansionSnapshotV2,
  retainDebateMysteryMansionSnapshotAssetsV2,
} from "../debate-mystery-mansion-bundles.ts";
import { initializeDatabase } from "../db.ts";
import { encryptBytes } from "../security.ts";

function layout(): MansionLayoutV2 {
  return {
    version: 2,
    envelope: { columns: 16, rows: 12 },
    entities: [
      {
        kind: "room", id: "foyer", templateId: "foyer", name: "Foyer",
        floor: 1, x: 0, y: 0, rotation: 0, suspectSlotId: null, emoji: "◇",
        imageId: null, bundledAssetPath: null, acceptedRoomAssetId: "accepted-room",
      },
      {
        kind: "room", id: "landing", templateId: "guest-bedroom", name: "Landing",
        floor: 2, x: 0, y: 0, rotation: 0, suspectSlotId: null, emoji: "◇",
        imageId: null, bundledAssetPath: null, acceptedRoomAssetId: null,
      },
    ],
    doors: [],
    verticalConnectors: [{
      id: "stairs:foyer:landing", kind: "stairs", lowerEntityId: "foyer", upperEntityId: "landing",
    }],
    placementAnchors: [],
    lights: [],
    roomArtCandidates: [{
      id: "candidate:foyer",
      roomId: "foyer",
      status: "ready",
      prompt: "Spoiler-free room prompt.",
      promptSha256: "a".repeat(64),
      assetId: "candidate-room",
      createdAt: "2026-08-28T00:00:00.000Z",
    }],
  };
}

function mansion(): DebateMysteryMansionBundleSummaryV1 {
  return {
    version: 1,
    id: "mansion",
    name: "Mutable library name",
    sourceSessionId: null,
    floors: 2,
    totalRooms: 2,
    scaleClass: "standard",
    suspectCount: 2,
    houseStyle: {
      version: 1,
      id: "gothic",
      label: "Gothic",
      promptContract: "Rain and walnut.",
      atmosphere: {
        version: 1,
        weather: "rain",
        timeOfDay: "night",
        exteriorSetting: "wooded estate",
        houseCondition: "patinated",
        mood: "restrained dread",
      },
      acousticThemePaletteId: "gothic-old-house-v1",
      bespokeAmbienceRequested: false,
    },
    rooms: [
      {
        id: "foyer", templateId: "foyer", name: "Foyer", floor: 1,
        x: 0, y: 0, width: 3, height: 2, neighborIds: ["landing"],
        assignedSuspectSeatId: null, emoji: "◇", imageId: null, bundledAssetPath: null,
      },
      {
        id: "landing", templateId: "guest-bedroom", name: "Landing", floor: 2,
        x: 0, y: 0, width: 4, height: 3, neighborIds: ["foyer"],
        assignedSuspectSeatId: null, emoji: "◇", imageId: null, bundledAssetPath: null,
      },
    ],
    layoutV2: layout(),
    assets: [
      { id: "cover", role: "presentation", logicalId: "exterior", mimeType: "image/webp", sha256: "1".repeat(64), byteLength: 20, durationMs: null },
      { id: "accepted-room", role: "room", logicalId: "foyer:accepted-v2", mimeType: "image/webp", sha256: "2".repeat(64), byteLength: 20, durationMs: null },
      { id: "candidate-room", role: "room", logicalId: "foyer:candidate-v2", mimeType: "image/webp", sha256: "3".repeat(64), byteLength: 20, durationMs: null },
      { id: "active-music", role: "music", logicalId: "investigation-theme-v1", mimeType: "audio/mpeg", sha256: "4".repeat(64), byteLength: 20, durationMs: 120_000 },
      { id: "previous-music", role: "music", logicalId: "investigation-theme-previous-v1", mimeType: "audio/mpeg", sha256: "5".repeat(64), byteLength: 20, durationMs: 120_000 },
    ],
    portable: null,
    derivation: null,
    library: {
      version: 1,
      defaults: { title: "Blackwood House", description: "Default description", thumbnailAssetId: "cover" },
      overrides: { title: "Frozen title", description: "Frozen description", thumbnailAssetId: "cover" },
    },
    music: {
      version: 1,
      identity: deriveMansionMusicIdentityV1({
        title: "Blackwood House",
        houseStyleLabel: "Gothic",
        houseStylePromptContract: "Rain and walnut.",
      }),
      active: { assetId: "active-music", title: "Active" },
      candidate: { assetId: "candidate-room", title: "Candidate", lens: "shadow" },
      previous: { assetId: "previous-music", title: "Previous" },
    },
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:00.000Z",
  };
}

describe("immutable mansion Case snapshots", () => {
  it("freezes canonical layout and presentation while excluding unaccepted candidates", () => {
    const source = mansion();
    const snapshot = freezeDebateMysteryMansionSnapshotV2(
      source,
      "2026-08-28T01:00:00.000Z",
    );
    assert.equal(snapshot.presentation.title, "Frozen title");
    assert.equal(snapshot.layoutV2?.roomArtCandidates.length, 0);
    assert.deepEqual(snapshot.presentation.assets.map((asset) => asset.id), [
      "accepted-room", "active-music", "cover",
    ]);
    assert.equal(
      snapshot.layoutSha256,
      createHash("sha256").update(canonicalMansionLayoutV2(snapshot.layoutV2!)).digest("hex"),
    );

    source.name = "Changed after Case creation";
    source.library!.overrides.title = "Changed title";
    source.layoutV2!.entities[0]!.x = 9;
    source.assets!.splice(0, source.assets!.length);
    assert.equal(snapshot.presentation.title, "Frozen title");
    assert.equal(snapshot.layoutV2?.entities[0]?.x, 0);
    assert.equal(snapshot.presentation.assets.length, 3);

    const reordered = mansion();
    reordered.rooms.reverse();
    reordered.layoutV2!.entities.reverse();
    reordered.assets!.reverse();
    const same = freezeDebateMysteryMansionSnapshotV2(
      reordered,
      "2026-08-28T09:00:00.000Z",
    );
    assert.equal(same.layoutSha256, snapshot.layoutSha256);
    assert.equal(same.presentationSha256, snapshot.presentationSha256);
  });

  it("retains frozen protected assets only inside the owning tenant", () => {
    const db = initializeDatabase(new DatabaseSync(":memory:"));
    const now = "2026-08-28T00:00:00.000Z";
    for (const [id, email] of [["owner", "owner@example.com"], ["other", "other@example.com"]]) {
      db.prepare(
        `INSERT INTO users
           (id, email, display_name, password_hash, password_salt,
            wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
            preferred_provider, created_at, last_active_at)
         VALUES (?, ?, ?, 'hash', 'salt', 'cipher', 'iv', 'tag', 'local', ?, ?)`,
      ).run(id, email, id, now, now);
    }
    db.prepare(
      `INSERT INTO debate_mystery_mansion_bundles
         (id, user_id, source_session_id, name, floors, total_rooms, suspect_count,
          style_json, layout_json, created_at, updated_at)
       VALUES ('mansion', 'owner', NULL, 'Blackwood', 2, 2, 2, '{}', '[]', ?, ?)`,
    ).run(now, now);
    const bytes = Buffer.from("frozen-cover");
    const encrypted = encryptBytes(bytes, Buffer.alloc(32, 3));
    db.prepare(
      `INSERT INTO debate_mystery_mansion_assets
         (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
          mime_type, width, height, provider, model, created_at, updated_at)
       VALUES ('cover', 'owner', ?, ?, ?, ?, ?, 'image/webp', 1, 1, 'fixture', 'fixture', ?, ?)`,
    ).run(
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      createHash("sha256").update(bytes).digest("hex"),
      bytes.length,
      now,
      now,
    );
    db.prepare(
      `INSERT INTO debate_mystery_mansion_asset_refs
         (bundle_id, user_id, asset_id, role, logical_id, created_at)
       VALUES ('mansion', 'owner', 'cover', 'presentation', 'exterior', ?)`,
    ).run(now);
    const snapshot = freezeDebateMysteryMansionSnapshotV2(mansion());
    retainDebateMysteryMansionSnapshotAssetsV2(db, "other", "foreign-case", snapshot);
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_asset_refs WHERE logical_id LIKE 'case:%'",
    ).get() as { count: number }).count, 0);
    retainDebateMysteryMansionSnapshotAssetsV2(db, "owner", "owner-case", snapshot);
    const retained = db.prepare(
      "SELECT user_id, asset_id, logical_id FROM debate_mystery_mansion_asset_refs WHERE logical_id LIKE 'case:%'",
    ).all() as unknown as Array<{ user_id: string; asset_id: string; logical_id: string }>;
    assert.deepEqual(retained.map((entry) => ({ ...entry })), [{
      user_id: "owner",
      asset_id: "cover",
      logical_id: "case:owner-case:presentation:cover",
    }]);
  });
});
