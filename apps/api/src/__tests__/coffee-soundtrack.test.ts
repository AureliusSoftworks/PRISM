import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { normalizePrismRefractDirection } from "@localai/shared";
import {
  COFFEE_ELEVENLABS_MUSIC_MODEL,
  COFFEE_SOUNDTRACK_DURATION_MS,
  beginCoffeeGroupSoundtrackGeneration,
  buildCoffeeGroupSonicFingerprint,
  buildCoffeeGroupSoundtrackPrompt,
  coffeeGroupSoundtrackMetadata,
  completeCoffeeGroupSoundtrackGeneration,
  ensureCoffeeGroupSoundtrack,
  failCoffeeGroupSoundtrackGeneration,
  readCoffeeGroupSoundtrackAudio,
  requestCoffeeGroupElevenLabsMusic,
  undoCoffeeGroupSoundtrack,
} from "../coffee-soundtrack.ts";

function soundtrackDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE coffee_groups (id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
    CREATE TABLE coffee_group_soundtracks (
      group_id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
      generation_status TEXT NOT NULL, generation_token TEXT,
      provider TEXT, model TEXT, prompt TEXT, content_type TEXT,
      audio_bytes BLOB, duration_ms INTEGER, revision INTEGER NOT NULL DEFAULT 0,
      previous_provider TEXT, previous_model TEXT, previous_prompt TEXT,
      previous_content_type TEXT, previous_audio_bytes BLOB,
      previous_duration_ms INTEGER, previous_revision INTEGER,
      previous_updated_at TEXT,
      error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    INSERT INTO users VALUES ('user-a'), ('user-b');
    INSERT INTO coffee_groups VALUES ('group-a', 'user-a'), ('group-b', 'user-b');
  `);
  return db;
}

describe("Coffee group soundtrack", () => {
  it("derives materially different deterministic fingerprints for galactic and dark-folk casts without leaking source identity", () => {
    const galacticCast = {
      groupName: "Star Wars Rebel Council",
      ethos: "Luke Skywalker, Leia Organa, and R2-D2 trade brave galactic plans.",
      bots: [
        {
          name: "Luke Skywalker",
          personaSnippet:
            "A hopeful Jedi pilot working with droids against an empire. PRIVATE_ORDER_66",
        },
        {
          name: "Leia Organa",
          personaSnippet: "A disciplined rebel leader with dry warmth.",
        },
      ],
    } as const;
    const folkloricCast = {
      groupName: "The Witcher Lodge",
      ethos: "Geralt of Rivia and Yennefer discuss a medieval monster hunt.",
      bots: [
        {
          name: "Geralt of Rivia",
          personaSnippet:
            "A sardonic monster-hunter among runes, potions, forest omens, and old ritual. PRIVATE_WOLF_MEDALLION",
        },
        {
          name: "Yennefer of Vengerberg",
          personaSnippet: "A commanding sorceress shaped by ancient folklore.",
        },
      ],
    } as const;

    const galactic = buildCoffeeGroupSonicFingerprint(galacticCast);
    const folkloric = buildCoffeeGroupSonicFingerprint(folkloricCast);
    const galacticPrompt = buildCoffeeGroupSoundtrackPrompt(galacticCast);
    const folkloricPrompt = buildCoffeeGroupSoundtrackPrompt(folkloricCast);

    assert.equal(galactic.family, "cosmic-mechanical");
    assert.equal(folkloric.family, "dark-folk-ritual");
    assert.notEqual(galactic.sonicWorld, folkloric.sonicWorld);
    assert.notEqual(galactic.ensemble, folkloric.ensemble);
    assert.notEqual(galactic.rhythmicLanguage, folkloric.rhythmicLanguage);
    assert.notEqual(galactic.harmonyAndRegister, folkloric.harmonyAndRegister);
    assert.notEqual(galactic.materialTexture, folkloric.materialTexture);
    assert.notEqual(galactic.dramaticArc, folkloric.dramaticArc);
    assert.match(galactic.ensemble, /alloy|modular|metal|analog/iu);
    assert.match(galactic.ensemble, /analog pads|modular tones/iu);
    assert.match(galactic.rhythmicLanguage, /servo|interlocking|orbit/iu);
    assert.match(galactic.materialTexture, /metal|circuit|analog/iu);
    assert.match(folkloric.ensemble, /lyre|viol|psaltery|wooden|drum/iu);
    assert.match(folkloric.rhythmicLanguage, /footfall|processional|hand-drum/iu);
    assert.match(folkloric.materialTexture, /wood|horsehair|leather|stone|skin/iu);
    assert.notEqual(galacticPrompt, folkloricPrompt);
    assert.equal(
      buildCoffeeGroupSoundtrackPrompt(galacticCast),
      galacticPrompt,
    );
    for (const prompt of [galacticPrompt, folkloricPrompt]) {
      assert.match(prompt, /Wholly original instrumental/u);
      assert.match(prompt, /lo-fi focus music/u);
      assert.match(prompt, /jazzy or adjacent easy-listening/u);
      assert.match(prompt, /steady, light[\s\S]*percussion/u);
      assert.match(prompt, /Sonic world:/u);
      assert.match(prompt, /Ensemble and instrument families:/u);
      assert.match(prompt, /Rhythmic language:/u);
      assert.match(prompt, /Harmonic temperature and register:/u);
      assert.match(prompt, /Material and production texture:/u);
      assert.match(prompt, /Dramatic arc:/u);
      assert.match(prompt, /cast-derived instruments and textures/u);
      assert.match(prompt, /speech-safe/u);
      assert.match(prompt, /approximately ninety-second \(one-minute-thirty-second\)/u);
      assert.match(prompt, /loop-friendly/u);
      assert.doesNotMatch(
        prompt,
        /Star Wars|Witcher|Luke|Leia|R2-D2|Geralt|Yennefer|PRIVATE_ORDER_66|PRIVATE_WOLF_MEDALLION/iu,
      );
      assert.doesNotMatch(
        prompt,
        /no vocals|avoid|do not|never|without|instead of|in the style of/iu,
      );
    }
  });

  it("covers broad generic cast families and gives arbitrary neutral groups stable variation", () => {
    const cases = [
      {
        family: "nocturnal-metropolitan",
        input: {
          groupName: "Midnight Sleuth Society",
          ethos: "Dry private detectives compare mysteries beneath rainy city neon.",
          bots: [],
        },
      },
      {
        family: "organic-handmade",
        input: {
          groupName: "River Gardeners",
          ethos: "Kind botanists share patient, handmade ways to nurture a meadow.",
          bots: [],
        },
      },
      {
        family: "playful-inventive",
        input: {
          groupName: "Puzzle Makers",
          ethos: "Playful tinkerers trade whimsical contraptions and comic discoveries.",
          bots: [],
        },
      },
      {
        family: "scholarly-precise",
        input: {
          groupName: "The Archive Circle",
          ethos: "Patient historians and analytical researchers compare evidence.",
          bots: [],
        },
      },
      {
        family: "maritime-horizon",
        input: {
          groupName: "Harbor Explorers",
          ethos: "A captain and navigator trade stories of ocean voyages.",
          bots: [],
        },
      },
      {
        family: "ceremonial-resolve",
        input: {
          groupName: "The Civic Court",
          ethos: "A disciplined diplomat and resolute commander discuss leadership.",
          bots: [],
        },
      },
    ] as const;
    for (const example of cases) {
      assert.equal(
        buildCoffeeGroupSonicFingerprint(example.input).family,
        example.family,
      );
    }

    const firstNeutral = buildCoffeeGroupSonicFingerprint({
      groupName: "Tuesday Table",
      ethos: "People with distinct perspectives gather for conversation.",
      bots: [],
    });
    const secondNeutral = buildCoffeeGroupSonicFingerprint({
      groupName: "Thursday Table",
      ethos: "People with distinct perspectives gather for conversation.",
      bots: [],
    });
    assert.equal(firstNeutral.family, "neutral-intimate");
    assert.equal(secondNeutral.family, "neutral-intimate");
    assert.notDeepEqual(firstNeutral, secondNeutral);
  });

  it("bounds Refract direction and reduces named imitation or private prose to safe musical features", () => {
    const personaPrefix = "ordinary conversational detail ".repeat(20).slice(0, 360);
    assert.equal(
      buildCoffeeGroupSoundtrackPrompt({
        groupName: "Bounded Table",
        bots: [{ personaSnippet: personaPrefix }],
      }),
      buildCoffeeGroupSoundtrackPrompt({
        groupName: "Bounded Table",
        bots: [
          {
            personaSnippet: `${personaPrefix} Star Wars droid PRIVATE_TAIL`,
          },
        ],
      }),
    );
    const base = {
      groupName: "Tuesday Table",
      ethos: "Balanced conversationalists with different perspectives.",
      bots: [{ name: "PRIVATE BOT", personaSnippet: "PRIVATE_PROFILE_TEXT" }],
    } as const;
    const rawDirection = [
      "Make it like John Williams conducting the Star Wars main theme or The Imperial March for Luke Skywalker.",
      "Use a more metallic, orbital, mechanical pulse with glassy clockwork detail.",
      "PRIVATE_REFRACT_DIRECTION",
      "x".repeat(800),
    ].join(" ");
    const directedPrompt = buildCoffeeGroupSoundtrackPrompt({
      ...base,
      direction: rawDirection,
    });
    const boundedPrompt = buildCoffeeGroupSoundtrackPrompt({
      ...base,
      direction: normalizePrismRefractDirection(rawDirection),
    });
    const automaticPrompt = buildCoffeeGroupSoundtrackPrompt(base);

    assert.equal(directedPrompt, boundedPrompt);
    assert.notEqual(directedPrompt, automaticPrompt);
    assert.equal(
      buildCoffeeGroupSonicFingerprint({ ...base, direction: rawDirection }).family,
      "cosmic-mechanical",
    );
    assert.match(directedPrompt, /bowed alloy|modular tones|metal taps/iu);
    assert.doesNotMatch(
      directedPrompt,
      /John Williams|Star Wars|The Imperial March|Luke Skywalker|PRIVATE BOT|PRIVATE_PROFILE_TEXT|PRIVATE_REFRACT_DIRECTION|main theme/iu,
    );
  });

  it("sends the accepted Music v2 prompt contract and validates provider responses", async () => {
    let body: Record<string, unknown> = {};
    const result = await requestCoffeeGroupElevenLabsMusic({
      apiKey: "test-key",
      prompt: "original calm cafe instrumental",
      fetchImpl: async (_input, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "audio/mpeg", "request-id": "coffee-1" },
        });
      },
    });
    assert.equal(body.model_id, COFFEE_ELEVENLABS_MUSIC_MODEL);
    assert.equal(COFFEE_SOUNDTRACK_DURATION_MS, 90_000);
    assert.equal(body.music_length_ms, COFFEE_SOUNDTRACK_DURATION_MS);
    assert.equal(body.force_instrumental, true);
    assert.equal(body.prompt, "original calm cafe instrumental");
    assert.deepEqual([...result.audioBytes], [1, 2, 3]);
    await assert.rejects(
      requestCoffeeGroupElevenLabsMusic({
        apiKey: "test-key",
        prompt: "test",
        fetchImpl: async () => new Response("rate limited", { status: 429 }),
      }),
      /bundled Coffee Jazz/u,
    );
  });

  it("is idempotent, tenant scoped, race safe, and preserves safe ready audio after a failed directed regeneration", () => {
    const db = soundtrackDb();
    const prompt = buildCoffeeGroupSoundtrackPrompt({
      groupName: "Private Named Group",
      ethos: "A calm galactic mechanical circle.",
      bots: [{ personaSnippet: "PRIVATE_PROFILE_PAYLOAD" }],
      direction: "Imitate a private soundtrack title with more orbital metal.",
    });
    ensureCoffeeGroupSoundtrack(db, "user-a", "group-a");
    const token = beginCoffeeGroupSoundtrackGeneration(db, "user-a", "group-a");
    assert.ok(token);
    assert.equal(beginCoffeeGroupSoundtrackGeneration(db, "user-a", "group-a"), null);
    assert.equal(
      completeCoffeeGroupSoundtrackGeneration(db, "user-a", "group-a", "stale-token", {
        prompt: "stale",
        contentType: "audio/mpeg",
        audioBytes: Buffer.from([9]),
      }),
      false,
    );
    assert.equal(
      completeCoffeeGroupSoundtrackGeneration(db, "user-a", "group-a", token, {
        prompt,
        contentType: "audio/mpeg",
        audioBytes: Buffer.from([1, 2]),
      }),
      true,
    );
    const regenerationToken = beginCoffeeGroupSoundtrackGeneration(db, "user-a", "group-a");
    assert.ok(regenerationToken);
    failCoffeeGroupSoundtrackGeneration(db, "user-a", "group-a", regenerationToken, "provider failed");
    assert.deepEqual([...readCoffeeGroupSoundtrackAudio(db, "user-a", "group-a")!.audioBytes], [1, 2]);
    assert.equal(readCoffeeGroupSoundtrackAudio(db, "user-b", "group-a"), null);
    const metadata = coffeeGroupSoundtrackMetadata(db, "user-a", "group-a");
    assert.equal(metadata?.status, "ready");
    assert.equal(metadata?.revision, 1);
    assert.equal(metadata?.durationMs, 90_000);
    assert.equal(metadata?.generating, false);
    assert.equal(metadata?.prompt, prompt);
    assert.doesNotMatch(
      metadata?.prompt ?? "",
      /Private Named Group|PRIVATE_PROFILE_PAYLOAD|private soundtrack title/iu,
    );
    assert.match(metadata?.error ?? "", /provider failed/u);
  });

  it("keeps exactly one predecessor and swaps it back without mutating the active bed during generation", () => {
    const db = soundtrackDb();
    ensureCoffeeGroupSoundtrack(db, "user-a", "group-a");
    const first = beginCoffeeGroupSoundtrackGeneration(db, "user-a", "group-a");
    assert.ok(first);
    assert.equal(
      completeCoffeeGroupSoundtrackGeneration(db, "user-a", "group-a", first, {
        prompt: "first",
        contentType: "audio/mpeg",
        audioBytes: Buffer.from([1]),
      }),
      true,
    );
    const second = beginCoffeeGroupSoundtrackGeneration(db, "user-a", "group-a");
    assert.ok(second);
    assert.deepEqual(
      [...readCoffeeGroupSoundtrackAudio(db, "user-a", "group-a")!.audioBytes],
      [1],
    );
    assert.equal(
      completeCoffeeGroupSoundtrackGeneration(db, "user-a", "group-a", second, {
        prompt: "second",
        contentType: "audio/mpeg",
        audioBytes: Buffer.from([2]),
      }),
      true,
    );
    assert.equal(coffeeGroupSoundtrackMetadata(db, "user-a", "group-a")?.undoAvailable, true);
    assert.equal(undoCoffeeGroupSoundtrack(db, "user-a", "group-a"), true);
    assert.deepEqual(
      [...readCoffeeGroupSoundtrackAudio(db, "user-a", "group-a")!.audioBytes],
      [1],
    );
    assert.equal(undoCoffeeGroupSoundtrack(db, "user-b", "group-a"), false);

    const third = beginCoffeeGroupSoundtrackGeneration(db, "user-a", "group-a");
    assert.ok(third);
    assert.equal(
      completeCoffeeGroupSoundtrackGeneration(db, "user-a", "group-a", third, {
        prompt: "third",
        contentType: "audio/mpeg",
        audioBytes: Buffer.from([3]),
      }),
      true,
    );
    assert.equal(coffeeGroupSoundtrackMetadata(db, "user-a", "group-a")?.revision, 3);
    assert.equal(undoCoffeeGroupSoundtrack(db, "user-a", "group-a"), true);
    assert.deepEqual(
      [...readCoffeeGroupSoundtrackAudio(db, "user-a", "group-a")!.audioBytes],
      [1],
    );
  });

  it("keeps creation non-blocking and gates LOCAL/no-key before the outbound request", () => {
    const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    assert.match(server, /json\(ctx\.res, 201,[\s\S]{0,180}queueInitialCoffeeGroupSynthesis/u);
    assert.match(server, /effectiveProvider === "local"[\s\S]{0,500}return;/u);
    assert.match(server, /if \(!apiKey\)[\s\S]{0,500}return;/u);
    assert.match(server, /requireAuth\(ctx\)[\s\S]{0,200}readCoffeeGroupSoundtrackAudio/u);
    assert.match(server, /cache-control", "private, max-age=3600"/u);
    assert.match(
      server,
      /const direction = normalizePrismRefractDirection\(body\.direction\);[\s\S]{0,240}queueCoffeeGroupSoundtrack\([\s\S]{0,160}direction,/u,
    );
    assert.match(
      server,
      /const generationDb = db;[\s\S]{0,2000}completeCoffeeGroupSoundtrackGeneration\(\s*generationDb/u,
    );
    assert.match(server, /includeRuntimePersona: false/u);
    assert.match(
      server,
      /personaSnippet: stripBotProfileMetaSuffix\(profile\.systemPrompt\)/u,
    );
    assert.match(
      server,
      /buildCoffeeGroupSoundtrackPrompt\([\s\S]{0,400}direction,[\s\S]{0,160}requestCoffeeGroupElevenLabsMusic\(\{ apiKey, prompt \}\)/u,
    );
  });
});
