import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  buildDebateMysteryMansionThemePromptV1,
  ensureDebateMysteryMansionThemeV1,
} from "../debate-mystery-mansion-theme.ts";
import { initializeDatabase } from "../db.ts";

const now = "2026-08-27T00:00:00.000Z";

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
     VALUES ('mansion', 'owner', NULL, 'Jungle Glasshouse', 1, 1, 1, ?, '[]', ?, ?)`,
  ).run(JSON.stringify({
    version: 1,
    id: "jungle",
    label: "Rain-soaked jungle glasshouse",
    promptContract: "Wet leaves, old brass, glass and patient shadows.",
  }), now, now);
  return { db, key: Buffer.alloc(32, 7) };
}

describe("Whodunnit mansion theme generation", () => {
  it("keeps LOCAL strictly offline and returns the bundled fallback", async () => {
    const { db, key } = fixture();
    let fetchCount = 0;
    const result = await ensureDebateMysteryMansionThemeV1({
      db, userKey: key, userId: "owner", bundleId: "mansion",
      requested: true, responseMode: "local", apiKey: "configured",
      fetchImpl: (async () => {
        fetchCount += 1;
        throw new Error("network forbidden");
      }) as typeof fetch,
    });
    assert.deepEqual(result, { source: "bundled_fallback", assetId: null, failure: null });
    assert.equal(fetchCount, 0);
  });

  it("stores validated ONLINE MP3 bytes with provider provenance and reuses them", async () => {
    const { db, key } = fixture();
    const audio = readFileSync(new URL(
      "../../../web/public/audio/debate/whodunnit/the-midnight-clue.mp3",
      import.meta.url,
    ));
    let fetchCount = 0;
    const generate = () => ensureDebateMysteryMansionThemeV1({
      db, userKey: key, userId: "owner", bundleId: "mansion",
      requested: true, responseMode: "online" as const, apiKey: "configured",
      fetchImpl: (async (_input, init) => {
        fetchCount += 1;
        const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
        assert.equal(request.force_instrumental, true);
        return new Response(audio, {
          status: 200,
          headers: { "content-type": "audio/mpeg", "request-id": "fixture-theme" },
        });
      }) as typeof fetch,
    });
    const created = await generate();
    assert.equal(created.source, "generated");
    assert.ok(created.assetId);
    const stored = db.prepare(
      `SELECT assets.provider, assets.model, assets.duration_ms, refs.role
         FROM debate_mystery_mansion_asset_refs AS refs
         JOIN debate_mystery_mansion_assets AS assets ON assets.id = refs.asset_id
        WHERE refs.user_id = 'owner' AND refs.bundle_id = 'mansion'`,
    ).get() as { provider: string; model: string; duration_ms: number; role: string };
    assert.deepEqual(
      { provider: stored.provider, model: stored.model, role: stored.role },
      { provider: "elevenlabs", model: "music_v2", role: "music" },
    );
    assert.ok(stored.duration_ms > 30_000);
    assert.equal((await generate()).source, "existing");
    assert.equal(fetchCount, 1);
  });

  it("keeps provider or media failure non-blocking", async () => {
    const { db, key } = fixture();
    const result = await ensureDebateMysteryMansionThemeV1({
      db, userKey: key, userId: "owner", bundleId: "mansion",
      requested: true, responseMode: "online", apiKey: "configured",
      fetchImpl: (async () => new Response("not mp3", {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      })) as typeof fetch,
    });
    assert.equal(result.source, "bundled_fallback");
    assert.match(result.failure ?? "", /signature|invalid|audio/iu);
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_asset_refs",
    ).get() as { count: number }).count, 0);
  });

  it("builds a provider-safe instrumental loop prompt", () => {
    const prompt = buildDebateMysteryMansionThemePromptV1({
      title: "Jungle Glasshouse",
      houseStyleLabel: "Jungle",
      houseStylePromptContract: "Rain and old brass.",
    });
    assert.match(prompt, /instrumental/u);
    assert.match(prompt, /steady/u);
    assert.match(prompt, /no vocals/u);
    assert.match(prompt, /loop/u);
  });
});
