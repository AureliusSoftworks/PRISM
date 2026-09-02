import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  addAutoCenteredMansionLayoutV2Doors,
  canonicalMansionLayoutV2,
  type MansionLayoutRoomV2,
  type MansionLayoutV2,
} from "@localai/shared";
import sharp from "sharp";
import {
  acceptMansionRoomArtCandidateV2,
  buildMansionRoomArtCandidatePromptV2,
  discardMansionRoomArtCandidateV2,
  regenerateMansionRoomAssetV2,
  stageMansionRoomArtCandidateV2,
} from "../debate-mystery-mansion-room-art.ts";
import { renderDebateMysteryRoomArtV1 } from "../debate-mystery-room-art.ts";
import { decryptBytes } from "../security.ts";
import { initializeDatabase } from "../db.ts";

function room(
  id: string,
  templateId: string,
  floor: number,
  x: number,
  y: number,
): MansionLayoutRoomV2 {
  return {
    kind: "room",
    id,
    templateId,
    name: id === "foyer" ? "Foyer" : id,
    floor,
    x,
    y,
    rotation: 0,
    suspectSlotId: null,
    emoji: "◇",
    imageId: null,
    bundledAssetPath: null,
    acceptedRoomAssetId: null,
  };
}

function fixtureLayout(): MansionLayoutV2 {
  let layout: MansionLayoutV2 = {
    version: 2,
    envelope: { columns: 16, rows: 12 },
    entities: [
      room("foyer", "foyer", 1, 0, 0),
      room("parlor", "parlor", 1, 3, 0),
      room("landing", "guest-bedroom", 2, 0, 0),
      room("bath", "bathroom", 2, 4, 0),
      room("study", "study", 2, 6, 0),
    ],
    doors: [],
    verticalConnectors: [{
      id: "stairs:foyer:landing",
      kind: "stairs",
      lowerEntityId: "foyer",
      upperEntityId: "landing",
    }],
    placementAnchors: [{
      id: "anchor:desk",
      roomId: "study",
      name: "writing desk",
      relation: "beside",
      point: { x: 0.72, y: 0.61 },
    }],
    lights: [{
      id: "light:desk",
      roomId: "study",
      kind: "omni",
      color: "#e4b56f",
      intensity: 0.68,
      animationSeed: "study-desk",
      cuePermission: { version: 1, mode: "mansion_static", allowedCueIds: [] },
      geometry: { x: 0.69, y: 0.38, radius: 0.24 },
    }],
    roomArtCandidates: [],
  };
  for (const id of ["foyer", "parlor", "landing", "bath", "study"]) {
    layout = addAutoCenteredMansionLayoutV2Doors(layout, id);
  }
  return layout;
}

function fixture(): { db: DatabaseSync; layout: MansionLayoutV2 } {
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
  const layout = fixtureLayout();
  db.prepare(
    `INSERT INTO debate_mystery_mansion_bundles
       (id, user_id, source_session_id, name, floors, total_rooms,
        suspect_count, style_json, layout_json, derivation_metadata_json,
        created_at, updated_at)
     VALUES ('mansion', 'owner', NULL, 'Blackwood Study', 2, 5, 4, ?, ?, ?, ?, ?)`,
  ).run(
    JSON.stringify({
      version: 1,
      id: "blackwood",
      label: "1890s Gothic Revival",
      promptContract: "Rain, walnut, patina, old windows, and restrained noir.",
    }),
    canonicalMansionLayoutV2(layout),
    JSON.stringify({
      version: 1,
      sourceBundleId: "source",
      sourceTitle: "Blackwood House",
      sourcePackageId: null,
      acceptedExteriorScaleClass: "standard",
      createdAt: now,
    }),
    now,
    now,
  );
  return { db, layout };
}

function storedLayout(db: DatabaseSync): MansionLayoutV2 {
  const row = db.prepare(
    "SELECT layout_json FROM debate_mystery_mansion_bundles WHERE id = 'mansion'",
  ).get() as { layout_json: string };
  return JSON.parse(row.layout_json) as MansionLayoutV2;
}

describe("mansion-owned room-art candidates", () => {
  it("builds a spoiler-free prompt from static mansion and anchor context", () => {
    const layout = fixtureLayout();
    const study = layout.entities.find(
      (entry): entry is MansionLayoutRoomV2 => entry.kind === "room" && entry.id === "study",
    )!;
    const prompt = buildMansionRoomArtCandidatePromptV2({
      mansionName: "Blackwood House",
      styleJson: JSON.stringify({ label: "Gothic", promptContract: "Rain and walnut." }),
      room: study,
      layout,
    });
    assert.match(prompt, /beside writing desk at normalized \(0\.72, 0\.61\)/u);
    assert.match(prompt, /omni at normalized \(0\.69, 0\.38\) with intensity 0\.68/u);
    assert.match(prompt, /PRISM renders their light dynamically at runtime/u);
    assert.match(prompt, /not a hotspot map/u);
    assert.match(prompt, /high-resolution hand-crafted Pixel Art/u);
    assert.match(prompt, /Do not create a realistic plate and then downsample/u);
    assert.match(prompt, /Do not impose a global sepia/u);
    assert.match(prompt, /Do not include people.*clues.*case-specific facts/u);
  });

  it("rejects LOCAL and cross-tenant generation before provider access", async () => {
    const { db } = fixture();
    let calls = 0;
    const generate = async () => {
      calls += 1;
      return { bytes: Buffer.from("never"), provider: "test", model: "test" };
    };
    await assert.rejects(
      stageMansionRoomArtCandidateV2({
        db, userKey: Buffer.alloc(32, 1), userId: "owner", bundleId: "mansion",
        roomId: "study", responseMode: "local", apiKey: "configured", generate,
      }),
      /ONLINE only.*LOCAL remains fully offline/u,
    );
    await assert.rejects(
      stageMansionRoomArtCandidateV2({
        db, userKey: Buffer.alloc(32, 2), userId: "other", bundleId: "mansion",
        roomId: "study", responseMode: "online", apiKey: "configured", generate,
      }),
      /not found/u,
    );
    assert.equal(calls, 0);
  });

  it("regenerates only the selected room and clears its authored nodes locally", () => {
    const { db, layout } = fixture();
    const authored: MansionLayoutV2 = {
      ...layout,
      entities: layout.entities.map((entry) => entry.id === "study" && entry.kind === "room"
        ? { ...entry, imageId: "legacy-study", acceptedRoomAssetId: "accepted-study" }
        : entry),
      placementAnchors: [
        ...layout.placementAnchors,
        { id: "anchor:bath", roomId: "bath", name: "mirror", relation: "near", point: { x: 0.5, y: 0.4 } },
      ],
      lights: [
        {
          id: "light:study", roomId: "study", kind: "omni", color: "#ffffff",
          intensity: 0.5, animationSeed: "study", cuePermission: { version: 1, mode: "mansion_static", allowedCueIds: [] },
          geometry: { x: 0.5, y: 0.5, radius: 0.2 },
        },
        {
          id: "light:bath", roomId: "bath", kind: "omni", color: "#ffffff",
          intensity: 0.5, animationSeed: "bath", cuePermission: { version: 1, mode: "mansion_static", allowedCueIds: [] },
          geometry: { x: 0.5, y: 0.5, radius: 0.2 },
        },
      ],
      roomArtCandidates: [{
        id: "candidate:study", roomId: "study", status: "failed", prompt: "safe",
        promptSha256: "a".repeat(64), assetId: null, createdAt: "2026-08-29T00:00:00.000Z",
      }],
    };
    db.prepare(
      "UPDATE debate_mystery_mansion_bundles SET layout_json = ? WHERE id = 'mansion' AND user_id = 'owner'",
    ).run(canonicalMansionLayoutV2(authored));

    regenerateMansionRoomAssetV2(db, "owner", "mansion", "study");
    const regenerated = storedLayout(db);
    const study = regenerated.entities.find(
      (entry): entry is MansionLayoutRoomV2 => entry.kind === "room" && entry.id === "study",
    )!;
    assert.equal(study.imageId, null);
    assert.equal(study.acceptedRoomAssetId, null);
    assert.equal(regenerated.placementAnchors.some((entry) => entry.roomId === "study"), false);
    assert.equal(regenerated.lights.some((entry) => entry.roomId === "study"), false);
    assert.equal(regenerated.roomArtCandidates.some((entry) => entry.roomId === "study"), false);
    assert.equal(regenerated.placementAnchors.some((entry) => entry.roomId === "bath"), true);
    assert.equal(regenerated.lights.some((entry) => entry.roomId === "bath"), true);
  });

  it("stages, retries, accepts, and discards content-addressed candidates without replacing accepted art early", async () => {
    const { db } = fixture();
    const firstBytes = await sharp({
      create: { width: 32, height: 18, channels: 3, background: "#5c3542" },
    }).png().toBuffer();
    const secondBytes = await sharp({
      create: { width: 32, height: 18, channels: 3, background: "#244b58" },
    }).png().toBuffer();
    let generation = 0;
    const stage = () => stageMansionRoomArtCandidateV2({
      db,
      userKey: Buffer.alloc(32, 7),
      userId: "owner",
      bundleId: "mansion",
      roomId: "study",
      responseMode: "online",
      apiKey: null,
      generate: async () => ({
        bytes: generation++ === 0 ? firstBytes : secondBytes,
        provider: "fixture-provider",
        model: "fixture-model",
      }),
    });

    const first = await stage();
    assert.equal(first.status, "ready");
    assert.equal(first.assetId !== null, true);
    let layout = storedLayout(db);
    let study = layout.entities.find(
      (entry): entry is MansionLayoutRoomV2 => entry.kind === "room" && entry.id === "study",
    )!;
    assert.equal(study.acceptedRoomAssetId, null);

    const retried = await stage();
    assert.equal(retried.id, first.id, "retry keeps the stable candidate identity");
    assert.notEqual(retried.assetId, first.assetId);
    const storedCandidate = db.prepare(
      `SELECT ciphertext, cipher_iv, cipher_tag
         FROM debate_mystery_mansion_assets
        WHERE id = ? AND user_id = 'owner'`,
    ).get(retried.assetId) as { ciphertext: Buffer; cipher_iv: Buffer; cipher_tag: Buffer };
    assert.deepEqual(
      decryptBytes({
        ciphertext: storedCandidate.ciphertext,
        iv: storedCandidate.cipher_iv,
        tag: storedCandidate.cipher_tag,
      }, Buffer.alloc(32, 7)),
      (await renderDebateMysteryRoomArtV1(secondBytes, {
        variant: "mosaic-reference",
        format: "webp",
      })).bytes,
      "Mansion Editor candidates use the canonical clean Pixel Art source normalizer",
    );
    layout = storedLayout(db);
    study = layout.entities.find(
      (entry): entry is MansionLayoutRoomV2 => entry.kind === "room" && entry.id === "study",
    )!;
    assert.equal(study.acceptedRoomAssetId, null);

    acceptMansionRoomArtCandidateV2(db, "owner", "mansion", "study");
    layout = storedLayout(db);
    study = layout.entities.find(
      (entry): entry is MansionLayoutRoomV2 => entry.kind === "room" && entry.id === "study",
    )!;
    assert.equal(study.acceptedRoomAssetId, retried.assetId);
    assert.equal(layout.roomArtCandidates.length, 0);
    assert.equal(
      layout.entities
        .filter((entry): entry is MansionLayoutRoomV2 => entry.kind === "room" && entry.id !== "study")
        .every((entry) => entry.acceptedRoomAssetId === null),
      true,
      "accepting one room must not upgrade any other room",
    );

    const acceptedAssetId = study.acceptedRoomAssetId;
    await stage();
    layout = storedLayout(db);
    study = layout.entities.find(
      (entry): entry is MansionLayoutRoomV2 => entry.kind === "room" && entry.id === "study",
    )!;
    assert.equal(study.acceptedRoomAssetId, acceptedAssetId);
    discardMansionRoomArtCandidateV2(db, "owner", "mansion", "study");
    layout = storedLayout(db);
    study = layout.entities.find(
      (entry): entry is MansionLayoutRoomV2 => entry.kind === "room" && entry.id === "study",
    )!;
    assert.equal(study.acceptedRoomAssetId, acceptedAssetId);
    assert.equal(layout.roomArtCandidates.length, 0);

    const assets = db.prepare(
      "SELECT sha256, provider, model FROM debate_mystery_mansion_assets WHERE user_id = 'owner' ORDER BY sha256",
    ).all() as unknown as Array<{ sha256: string; provider: string; model: string }>;
    assert.equal(assets.length, 1, "unreferenced retry and discard bytes are reclaimed");
    assert.equal(assets[0]?.provider, "fixture-provider");
    assert.equal(assets[0]?.model, "fixture-model");
  });
});
