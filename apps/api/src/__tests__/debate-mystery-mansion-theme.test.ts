import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  acceptDebateMysteryMansionThemeFieldRepairV1,
  acceptDebateMysteryMansionThemeV1,
  buildDebateMysteryMansionThemePromptV1,
  discardDebateMysteryMansionThemeV1,
  ensureDebateMysteryMansionThemeV1,
  resolveDebateMysteryMansionMusicIdentityV1,
  stageDebateMysteryMansionThemeV1,
  undoDebateMysteryMansionThemeV1,
  undoDebateMysteryMansionThemeFieldRepairV1,
  validateDebateMysteryMansionThemeCandidateV1,
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

function twoMinuteMusicFixture(name: "01" | "02" | "03" = "01"): Buffer {
  let phrase = readFileSync(new URL(
    `../../../web/public/audio/avatar/prism-calculating-${name}.mp3`,
    import.meta.url,
  ));
  if (phrase.subarray(0, 3).toString("ascii") === "ID3") {
    const tagSize =
      ((phrase[6] ?? 0) & 0x7f) * 2 ** 21 +
      ((phrase[7] ?? 0) & 0x7f) * 2 ** 14 +
      ((phrase[8] ?? 0) & 0x7f) * 2 ** 7 +
      ((phrase[9] ?? 0) & 0x7f);
    phrase = phrase.subarray(10 + tagSize);
  }
  if (phrase.length >= 128 && phrase.subarray(-128, -125).toString("ascii") === "TAG") {
    phrase = phrase.subarray(0, -128);
  }
  return Buffer.concat(Array.from({ length: 30 }, () => phrase));
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

  it("stores ONLINE MP3 bytes as an inactive candidate with provider provenance and reuses it", async () => {
    const { db, key } = fixture();
    const audio = twoMinuteMusicFixture();
    let fetchCount = 0;
    const generate = () => ensureDebateMysteryMansionThemeV1({
      db, userKey: key, userId: "owner", bundleId: "mansion",
      requested: true, responseMode: "online" as const, apiKey: "configured",
      fetchImpl: (async (_input, init) => {
        fetchCount += 1;
        const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
        assert.equal(request.force_instrumental, true);
        assert.equal(request.music_length_ms, 120_000);
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
      `SELECT assets.provider, assets.model, assets.duration_ms, refs.role, refs.logical_id
         FROM debate_mystery_mansion_asset_refs AS refs
         JOIN debate_mystery_mansion_assets AS assets ON assets.id = refs.asset_id
        WHERE refs.user_id = 'owner' AND refs.bundle_id = 'mansion'`,
    ).get() as { provider: string; model: string; duration_ms: number; role: string; logical_id: string };
    assert.deepEqual(
      { provider: stored.provider, model: stored.model, role: stored.role },
      { provider: "elevenlabs", model: "music_v2", role: "music" },
    );
    assert.ok(stored.duration_ms >= 110_000 && stored.duration_ms <= 130_000);
    assert.equal(stored.logical_id, "investigation-theme-candidate-v1");
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
    assert.match(prompt, /quiet furniture music/u);
    assert.match(prompt, /rest or near-silence/u);
    assert.match(prompt, /dialogue-safe/u);
    assert.match(prompt, /unresolved crime-scene tension/u);
    assert.match(prompt, /loop/u);
    assert.match(prompt, /45-65 percent/u);
    assert.match(prompt, /6-14 second musical phrases/u);
    assert.match(prompt, /8-24 second quiet intervals/u);
    assert.match(prompt, /sole sound sources are these musical instruments/u);
    assert.doesNotMatch(prompt, /\brain\b|\bweather\b|\bjungle\b|\bwindow\b|\bfireplace\b|\binsect\b|\bwildlife\b|\bhull\b|\bmachinery\b|L\.A\. Noire/iu);
    assert.doesNotMatch(prompt, /\bno vocals\b|\bno speech\b|\bavoid\b/iu);
  });

  it("removes legacy environmental source prose before provider prompt construction", () => {
    const unsafe = resolveDebateMysteryMansionMusicIdentityV1({
      title: "Blackwood House",
      styleJson: JSON.stringify({
        version: 1,
        id: "blackwood",
        label: "Gothic manor",
        promptContract: "Walnut halls",
        musicIdentity: {
          version: 1,
          soundSources: "instruments_only",
          noirSubgenre: "rain and window noir",
          tempoBpm: { min: 50, max: 64 },
          instrumentation: ["rain on glass", "fireplace", "bass clarinet"],
          acousticElectronicBalance: 0.1,
          harmonicCharacter: ["storm harmony", "window tension"],
          density: { min: 0.06, max: 0.17 },
          intensityCeiling: 0.24,
          foregroundRiskCeiling: 0.16,
          silenceRatio: { min: 0.45, max: 0.65 },
          phraseDurationSeconds: { min: 6, max: 14 },
          quietIntervalSeconds: { min: 8, max: 24 },
          loopBoundary: { quietWindowSeconds: 2, searchWindowSeconds: 8, crossfadeSeconds: 1.5 },
          geography: "mountains",
          architecture: "Gothic",
          weather: "rain",
          periodCues: [],
          role: "investigation_loop",
          speechSafe: true,
          semanticAudioPolicy: "non_semantic_music_only",
          instrumental: true,
          styleBoundaries: ["window sounds", "storm ambience"],
        },
      }),
    });
    const prompt = buildDebateMysteryMansionThemePromptV1({
      title: "Blackwood House",
      identity: unsafe,
    });
    assert.match(prompt, /felt piano/u);
    assert.doesNotMatch(prompt, /\brain\b|\bwindow\b|\bfireplace\b|\bstorm\b|\bambience\b/iu);
  });

  it("stages validated signature candidates until explicit accept and keeps one undo", async () => {
    const { db, key } = fixture();
    const first = twoMinuteMusicFixture("01");
    const second = twoMinuteMusicFixture("02");
    let generated = 0;
    const fetchImpl = (async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { prompt?: string; music_length_ms?: number };
      assert.equal(request.music_length_ms, 120_000);
      assert.match(request.prompt ?? "", /instrumental .*noir/u);
      assert.doesNotMatch(request.prompt ?? "", /client prompt|no vocals|avoid/iu);
      generated += 1;
      return new Response(generated === 1 ? first : second, {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      });
    }) as typeof fetch;
    const initialCandidate = await ensureDebateMysteryMansionThemeV1({
      db, userKey: key, userId: "owner", bundleId: "mansion",
      requested: true, responseMode: "online", apiKey: "configured", fetchImpl,
    });
    const initialDuration = Number((db.prepare(
      `SELECT assets.duration_ms FROM debate_mystery_mansion_asset_refs AS refs
         JOIN debate_mystery_mansion_assets AS assets ON assets.id = refs.asset_id
        WHERE refs.bundle_id = 'mansion' AND refs.logical_id = 'investigation-theme-candidate-v1'`,
    ).get() as { duration_ms: number }).duration_ms);
    validateDebateMysteryMansionThemeCandidateV1({
      db,
      userId: "owner",
      bundleId: "mansion",
      loop: {
        version: 1,
        loopStartMs: 1_000,
        loopEndMs: initialDuration - 1_000,
        crossfadeMs: 1_500,
        silenceRatio: 0.52,
      },
    });
    acceptDebateMysteryMansionThemeV1(db, "owner", "mansion");
    const staged = await stageDebateMysteryMansionThemeV1({
      db, userKey: key, userId: "owner", bundleId: "mansion",
      responseMode: "online", apiKey: "configured", fetchImpl,
    });
    assert.notEqual(staged.assetId, initialCandidate.assetId);
    assert.equal((db.prepare(
      "SELECT asset_id FROM debate_mystery_mansion_asset_refs WHERE bundle_id = 'mansion' AND logical_id = 'investigation-theme-v1'",
    ).get() as { asset_id: string }).asset_id, initialCandidate.assetId);
    assert.throws(
      () => acceptDebateMysteryMansionThemeV1(db, "owner", "mansion"),
      /Validate the decoded music preview/u,
    );
    const stagedDuration = Number((db.prepare(
      `SELECT assets.duration_ms FROM debate_mystery_mansion_asset_refs AS refs
         JOIN debate_mystery_mansion_assets AS assets ON assets.id = refs.asset_id
        WHERE refs.bundle_id = 'mansion' AND refs.logical_id = 'investigation-theme-candidate-v1'`,
    ).get() as { duration_ms: number }).duration_ms);
    validateDebateMysteryMansionThemeCandidateV1({
      db,
      userId: "owner",
      bundleId: "mansion",
      loop: {
        version: 1,
        loopStartMs: 1_000,
        loopEndMs: stagedDuration - 1_000,
        crossfadeMs: 1_500,
        silenceRatio: 0.52,
      },
    });
    acceptDebateMysteryMansionThemeV1(db, "owner", "mansion");
    const acceptedRefs = db.prepare(
      "SELECT logical_id, asset_id FROM debate_mystery_mansion_asset_refs WHERE bundle_id = 'mansion' AND role = 'music' ORDER BY logical_id",
    ).all() as unknown as Array<{ logical_id: string; asset_id: string }>;
    assert.deepEqual(acceptedRefs.map((ref) => ref.logical_id), [
      "investigation-theme-previous-v1",
      "investigation-theme-v1",
    ]);
    assert.equal(acceptedRefs.find((ref) => ref.logical_id === "investigation-theme-v1")?.asset_id, staged.assetId);
    undoDebateMysteryMansionThemeV1(db, "owner", "mansion");
    assert.equal((db.prepare(
      "SELECT asset_id FROM debate_mystery_mansion_asset_refs WHERE bundle_id = 'mansion' AND logical_id = 'investigation-theme-v1'",
    ).get() as { asset_id: string }).asset_id, initialCandidate.assetId);

    await stageDebateMysteryMansionThemeV1({
      db, userKey: key, userId: "owner", bundleId: "mansion",
      responseMode: "online", apiKey: "configured", fetchImpl,
    });
    discardDebateMysteryMansionThemeV1(db, "owner", "mansion");
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_asset_refs WHERE logical_id = 'investigation-theme-candidate-v1'",
    ).get() as { count: number }).count, 0);
  });

  it("rejects staged LOCAL generation before provider access", async () => {
    const { db, key } = fixture();
    let fetchCount = 0;
    await assert.rejects(
      stageDebateMysteryMansionThemeV1({
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

  it("accepts a no-preview field repair and can undo to the packaged fallback", async () => {
    const { db, key } = fixture();
    const audio = twoMinuteMusicFixture();
    const staged = await stageDebateMysteryMansionThemeV1({
      db, userKey: key, userId: "owner", bundleId: "mansion",
      responseMode: "online", apiKey: "configured",
      fetchImpl: (async () => new Response(audio, {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      })) as typeof fetch,
    });

    acceptDebateMysteryMansionThemeFieldRepairV1(db, "owner", "mansion");
    assert.equal((db.prepare(
      "SELECT asset_id FROM debate_mystery_mansion_asset_refs WHERE bundle_id = 'mansion' AND logical_id = 'investigation-theme-v1'",
    ).get() as { asset_id: string }).asset_id, staged.assetId);

    undoDebateMysteryMansionThemeFieldRepairV1(db, "owner", "mansion", false);
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_mansion_asset_refs WHERE bundle_id = 'mansion' AND logical_id = 'investigation-theme-v1'",
    ).get() as { count: number }).count, 0);
  });

  it("rejects concurrent generation for the same mansion", async () => {
    const { db, key } = fixture();
    const audio = twoMinuteMusicFixture("03");
    let announceFetch!: () => void;
    let releaseFetch!: () => void;
    const fetchStarted = new Promise<void>((resolve) => { announceFetch = resolve; });
    const fetchRelease = new Promise<void>((resolve) => { releaseFetch = resolve; });
    const first = stageDebateMysteryMansionThemeV1({
      db, userKey: key, userId: "owner", bundleId: "mansion",
      responseMode: "online", apiKey: "configured",
      fetchImpl: (async () => {
        announceFetch();
        await fetchRelease;
        return new Response(audio, {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        });
      }) as typeof fetch,
    });
    await fetchStarted;
    await assert.rejects(
      stageDebateMysteryMansionThemeV1({
        db, userKey: key, userId: "owner", bundleId: "mansion",
        responseMode: "online", apiKey: "configured",
        fetchImpl: (async () => { throw new Error("must not fetch twice"); }) as typeof fetch,
      }),
      /already in progress/u,
    );
    releaseFetch();
    await first;
  });
});
