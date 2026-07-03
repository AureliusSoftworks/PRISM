import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_BOT_PROFILE_FIELDS,
  type BotProfileFields,
} from "@localai/shared";

import {
  buildRandomizerPersonaDraft,
  generatedBotMemorySeedsForCreate,
  retargetGeneratedBotMemorySeeds,
} from "./botRandomizer.ts";
import { normalizeBotMarketplaceManifest } from "./botMarketplace.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicRoot = path.join(appRoot, "public");

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function sequenceRandom(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return value;
  };
}

function testProfile(): BotProfileFields {
  return {
    ...DEFAULT_BOT_PROFILE_FIELDS,
    purpose: { statement: "help the user make careful plans", legacyNotes: "" },
    core: {
      ...DEFAULT_BOT_PROFILE_FIELDS.core,
      traits: "steady, curious, and practical",
      interests: "maps, rituals, and quiet decisions",
      boundaries: "do not pretend to know blank details",
      quirks: "summarizes the route before the destination",
    },
    identity: {
      ...DEFAULT_BOT_PROFILE_FIELDS.identity,
      role: "fictional planning companion",
      background: "learned to turn vague errands into calm routes",
    },
    worldview: {
      ...DEFAULT_BOT_PROFILE_FIELDS.worldview,
      values: "patience, clarity, and useful constraints",
    },
    appearance: {
      ...DEFAULT_BOT_PROFILE_FIELDS.appearance,
      description: "plain coat, bright notebook, and calm hands",
    },
  };
}

describe("bot randomizer persona generation", () => {
  it("turns the Pirate Lens into a coherent pirate identity with seeded memories", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const pirateLens = manifest.lenses.find((lens) => lens.id === "pirate");
    assert.ok(pirateLens);

    const draft = buildRandomizerPersonaDraft({
      lens: pirateLens,
      fallbackName: "Alex",
      random: sequenceRandom([0, 0.18, 0.34, 0.52, 0.7, 0.86]),
    });
    const profileText = JSON.stringify(draft.profile).toLowerCase();
    const memoryText = draft.memories.map((memory) => memory.text).join("\n").toLowerCase();

    assert.match(draft.name, /^Captain /);
    assert.equal(draft.lensId, "pirate");
    assert.equal(draft.suggestedGlyph, "lucideShip");
    assert.equal(draft.faceStyle?.eyesFont, "playful");
    assert.match(draft.profile.purpose.statement, /pirate captain/i);
    assert.match(profileText, /ship|sea|treasure|crew|nautical|pirate/);
    assert.match(profileText, /fictional|playful/);
    assert.equal(draft.profile.facts.basedOnRealPersonOrCharacter, false);
    assert.equal(
      draft.profile.facts.customFacts.some((fact) => fact.label === "Ship"),
      true
    );
    assert.equal(draft.memories.length >= 8, true);
    assert.match(memoryText, /pirate lens/);
    assert.match(memoryText, /captain|ship|treasure|crew|voyages/);
    assert.match(memoryText, /real-world theft, violence, intimidation, or harm/);
    assert.equal(draft.memories.every((memory) => memory.tier === "long_term"), true);
  });

  it("turns a generic Lens into profile fields and seeded memories", () => {
    const manifest = normalizeBotMarketplaceManifest(
      readJsonFile(path.join(publicRoot, "bot-marketplace/manifest.json"))
    );
    const stoicLens = manifest.lenses.find((lens) => lens.id === "stoic");
    assert.ok(stoicLens);

    const draft = buildRandomizerPersonaDraft({
      lens: stoicLens,
      fallbackName: "Mira",
      baseProfile: testProfile(),
    });
    const profileText = JSON.stringify(draft.profile).toLowerCase();
    const memoryText = draft.memories.map((memory) => memory.text).join("\n").toLowerCase();

    assert.equal(draft.name, "Mira");
    assert.equal(draft.lensId, "stoic");
    assert.match(draft.profile.purpose.statement, /stoic lens/i);
    assert.match(profileText, /virtue|discipline|control|acceptance/);
    assert.match(memoryText, /stoic lens/);
    assert.match(memoryText, /interpretive influence, not an identity/);
  });

  it("adds memory seeds even for an unlensed randomizer draft", () => {
    const draft = buildRandomizerPersonaDraft({
      fallbackName: "Sage",
      baseProfile: testProfile(),
    });
    const memoryText = draft.memories.map((memory) => memory.text).join("\n");

    assert.equal(draft.name, "Sage");
    assert.equal(draft.lensId, "");
    assert.equal(draft.memories.length >= 6, true);
    assert.match(memoryText, /You are Sage, fictional planning companion/);
    assert.match(memoryText, /learned to turn vague errands into calm routes/);
    assert.match(memoryText, /patience, clarity, and useful constraints/);
  });

  it("retargets generated memories if the user renames the draft before creating it", () => {
    const memories = [
      { text: "You are Captain Marlowe Blacktide." },
      { text: "Captain Marlowe Blacktide keeps a brass compass." },
    ];

    const retargeted = retargetGeneratedBotMemorySeeds(
      memories,
      "Captain Marlowe Blacktide",
      "Captain Vera Stormglass"
    );

    assert.deepEqual(retargeted.map((memory) => memory.text), [
      "You are Captain Vera Stormglass.",
      "Captain Vera Stormglass keeps a brass compass.",
    ]);
    assert.notEqual(retargeted[0], memories[0]);
  });

  it("restores generated memories only for the current generation Lens", () => {
    assert.deepEqual(generatedBotMemorySeedsForCreate(null, "pirate", "Captain Vera"), []);

    const seedPlan = {
      lensId: "pirate",
      botName: "Captain Marlowe Blacktide",
      memories: [
        { text: "You are Captain Marlowe Blacktide." },
        { text: "Captain Marlowe Blacktide keeps a brass compass." },
        { text: "   " },
      ],
    };

    assert.deepEqual(
      generatedBotMemorySeedsForCreate(seedPlan, "pirate", "Captain Vera Stormglass").map(
        (memory) => memory.text
      ),
      [
        "You are Captain Vera Stormglass.",
        "Captain Vera Stormglass keeps a brass compass.",
      ]
    );
    assert.deepEqual(
      generatedBotMemorySeedsForCreate(seedPlan, "stoic", "Captain Vera Stormglass"),
      []
    );
  });
});
