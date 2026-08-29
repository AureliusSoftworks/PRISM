import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  acceptDebateMysteryMansionAtmosphereV1,
  buildDebateMysteryMansionAtmospherePromptV1,
  discardDebateMysteryMansionAtmosphereV1,
  stageDebateMysteryMansionAtmosphereV1,
  undoDebateMysteryMansionAtmosphereV1,
} from "../debate-mystery-mansion-atmosphere.ts";
import { initializeDatabase } from "../db.ts";

const now = "2026-08-28T00:00:00.000Z";

function fixture(): { db: DatabaseSync; key: Buffer } {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        preferred_provider, created_at, last_active_at)
     VALUES ('owner', 'owner@example.com', 'Owner', 'hash', 'salt',
             'cipher', 'iv', 'tag', 'local', ?, ?)`,
  ).run(now, now);
  db.prepare(
     `INSERT INTO debate_mystery_mansion_bundles
       (id, user_id, source_session_id, name, floors, total_rooms,
        suspect_count, style_json, layout_json, created_at, updated_at)
     VALUES ('mansion', 'owner', NULL, 'Blackwood House', 2, 1, 4, ?, ?, ?, ?)`,
  ).run(JSON.stringify({
    version: 1,
    id: "gothic-old-house",
    label: "1890s Gothic Revival manor",
    promptContract: "Dark walnut and brass",
    acousticThemePaletteId: "gothic-old-house-v1",
    atmosphere: {
      version: 1,
      weather: "heavy_rain",
      timeOfDay: "night",
      exteriorSetting: "isolated mountain estate",
      houseCondition: "weathered",
      mood: "watchful",
    },
  }), JSON.stringify([{
    id: "foyer",
    templateId: "foyer",
    name: "Foyer",
    floor: 1,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    neighborIds: [],
    assignedSuspectSeatId: null,
    emoji: "🚪",
    imageId: null,
    bundledAssetPath: null,
  }]), now, now);
  return { db, key: Buffer.alloc(32, 9) };
}

describe("Whodunnit mansion atmosphere generation", () => {
  it("builds a neutral world-bed prompt without music or case-significant events", () => {
    const prompt = buildDebateMysteryMansionAtmospherePromptV1({
      acousticThemePaletteId: "gothic-old-house-v1",
      styleId: "gothic-old-house",
      weather: "heavy_rain",
      timeOfDay: "night",
    });
    assert.match(prompt, /seamless environmental room-tone loop/u);
    assert.match(prompt, /weather against roof and windows/u);
    assert.match(prompt, /speech space/u);
    assert.doesNotMatch(prompt, /melody|instrument|score|song|voice|footstep|scream|gunshot|alarm|breaking glass/iu);
  });

  it("stages one 30-second world bed, then supports accept, discard, and undo", async () => {
    const { db, key } = fixture();
    const audio = readFileSync(new URL(
      "../../../web/public/audio/coffee/ambience/coffee-shop-foley-forest-loop.mp3",
      import.meta.url,
    ));
    let generated = 0;
    const fetchImpl = (async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(request.duration_seconds, 30);
      assert.equal(request.loop, true);
      assert.equal(request.model_id, "eleven_text_to_sound_v2");
      assert.match(String(request.text), /environmental room-tone/u);
      generated += 1;
      return new Response(audio, {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      });
    }) as typeof fetch;

    const first = await stageDebateMysteryMansionAtmosphereV1({
      db, userKey: key, userId: "owner", bundleId: "mansion",
      responseMode: "online", apiKey: "configured", fetchImpl,
    });
    acceptDebateMysteryMansionAtmosphereV1(db, "owner", "mansion");
    const accepted = db.prepare(
      `SELECT logical_id FROM debate_mystery_mansion_asset_refs
        WHERE bundle_id = 'mansion' AND logical_id LIKE 'ambience:%'`,
    ).all() as unknown as Array<{ logical_id: string }>;
    assert.deepEqual(accepted.map((entry) => entry.logical_id), ["ambience:world-bed-v1"]);

    await stageDebateMysteryMansionAtmosphereV1({
      db, userKey: key, userId: "owner", bundleId: "mansion",
      responseMode: "online", apiKey: "configured", fetchImpl,
    });
    acceptDebateMysteryMansionAtmosphereV1(db, "owner", "mansion");
    undoDebateMysteryMansionAtmosphereV1(db, "owner", "mansion");
    const restored = db.prepare(
      `SELECT asset_id FROM debate_mystery_mansion_asset_refs
        WHERE bundle_id = 'mansion' AND logical_id = 'ambience:world-bed-v1'`,
    ).get() as { asset_id: string };
    assert.equal(restored.asset_id, first.assetId);

    await stageDebateMysteryMansionAtmosphereV1({
      db, userKey: key, userId: "owner", bundleId: "mansion",
      responseMode: "online", apiKey: "configured", fetchImpl,
    });
    discardDebateMysteryMansionAtmosphereV1(db, "owner", "mansion");
    assert.equal((db.prepare(
      `SELECT COUNT(*) AS count FROM debate_mystery_mansion_asset_refs
        WHERE bundle_id = 'mansion' AND logical_id = 'ambience:world-bed-candidate-v1'`,
    ).get() as { count: number }).count, 0);
    assert.equal(generated, 3);
  });

  it("keeps LOCAL strictly offline", async () => {
    const { db, key } = fixture();
    let fetchCount = 0;
    await assert.rejects(
      stageDebateMysteryMansionAtmosphereV1({
        db, userKey: key, userId: "owner", bundleId: "mansion",
        responseMode: "local", apiKey: "configured",
        fetchImpl: (async () => {
          fetchCount += 1;
          throw new Error("network forbidden");
        }) as typeof fetch,
      }),
      /LOCAL remains fully offline/u,
    );
    assert.equal(fetchCount, 0);
  });
});
