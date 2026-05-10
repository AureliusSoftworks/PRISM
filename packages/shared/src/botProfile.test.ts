import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOT_FACT_KEY_LABELS,
  BOT_PROFILE_META_END,
  BOT_PROFILE_META_START,
  composeBotProfileProse,
  composeAugmentedImagePrompt,
  buildImagePersonaContext,
  DEFAULT_BOT_PROFILE_FIELDS,
  listBotProfileFacts,
  parseStoredBotPrompt,
  randomBotProfile,
  serializeStoredBotPrompt,
  stripBotProfileMetaSuffix,
  stripPurposeStatementPrefixes,
} from "./botProfile.ts";

describe("bot profile serialization", () => {
  it("preserves spaces in purpose statement tails for the editor", () => {
    assert.equal(
      stripPurposeStatementPrefixes("  hello  world  ", "Ada"),
      "  hello  world  "
    );
    assert.equal(
      stripPurposeStatementPrefixes("You are Ada,  spaced  out  ", "Ada"),
      "spaced  out  "
    );
  });

  it("round-trips the V2 profile metadata exactly enough for dirty checks", () => {
    const profile = parseStoredBotPrompt("").fields;
    profile.purpose.statement = "a moonlit pollster";
    profile.core.traits = "curious, exacting";
    profile.core.openness = 2;
    profile.core.conscientiousness = 1;
    profile.core.extraversion = -1;
    profile.core.agreeableness = 0;
    profile.core.emotionalStability = 2;
    profile.identity.species = "android";
    profile.worldview.politicalView = -1;
    profile.appearance.description = "silver coat, tired eyes";

    const stored = serializeStoredBotPrompt(profile, "Mira");
    const parsed = parseStoredBotPrompt(stored).fields;

    assert.deepEqual(parsed, profile);
    assert.equal(serializeStoredBotPrompt(parsed, "Mira"), stored);
  });

  it("composes filled OCEAN personality sliders into model-facing prose", () => {
    const profile = parseStoredBotPrompt("").fields;
    profile.core.openness = 2;
    profile.core.conscientiousness = 1;
    profile.core.extraversion = -2;
    profile.core.agreeableness = -1;
    profile.core.emotionalStability = 1;

    const prose = composeBotProfileProse(profile, "Mira");

    assert.match(prose, /Openness: highly exploratory and imaginative/);
    assert.match(prose, /Conscientiousness: methodical/);
    assert.match(prose, /Extraversion: reserved/);
    assert.match(prose, /Agreeableness: gently questioning/);
    assert.match(prose, /Emotional baseline: steady/);
  });

  it("keeps legacy personality sliders while defaulting missing OCEAN fields", () => {
    const stored = [
      "Old prose",
      BOT_PROFILE_META_START,
      JSON.stringify({
        v: 2,
        purpose: { statement: "A careful archivist.", legacyNotes: "" },
        core: {
          traits: "dry, patient",
          communicationStyle: "formal",
          humor: 1,
          curiosity: -1,
          directness: 2,
          interests: "",
          boundaries: "",
          quirks: "",
        },
        identity: {},
        worldview: {},
        appearance: {},
      }),
      BOT_PROFILE_META_END,
    ].join("\n");

    const parsed = parseStoredBotPrompt(stored).fields;
    const prose = composeBotProfileProse(parsed, "Rita");

    assert.equal(parsed.core.openness, null);
    assert.equal(parsed.core.conscientiousness, null);
    assert.equal(parsed.core.extraversion, null);
    assert.equal(parsed.core.agreeableness, null);
    assert.equal(parsed.core.emotionalStability, null);
    assert.equal(parsed.core.humor, 1);
    assert.equal(parsed.core.curiosity, -1);
    assert.equal(parsed.core.directness, 2);
    assert.match(prose, /Humor: witty/);
    assert.match(prose, /Curiosity: somewhat grounded/);
    assert.match(prose, /Directness: blunt when useful/);
  });

  it("migrates raw legacy prompts into purpose fine print", () => {
    const parsed = parseStoredBotPrompt("You speak only in haiku.").fields;

    assert.equal(parsed.v, 2);
    assert.equal(parsed.purpose.legacyNotes, "You speak only in haiku.");
    assert.equal(parsed.purpose.statement, "");
  });

  it("migrates V1 metadata into focused V2 categories", () => {
    const stored = [
      "Old prose",
      BOT_PROFILE_META_START,
      JSON.stringify({
        v: 1,
        persona: "A careful archivist.",
        voice: "formal",
        expertise: "source tracing",
        boundaries: "no invented citations",
        quirks: "numbers every drawer",
        extras: "Legacy extra note.",
      }),
      BOT_PROFILE_META_END,
    ].join("\n");

    const parsed = parseStoredBotPrompt(stored).fields;

    assert.equal(parsed.purpose.statement, "A careful archivist.");
    assert.equal(parsed.core.communicationStyle, "formal");
    assert.equal(parsed.core.interests, "source tracing");
    assert.equal(parsed.core.boundaries, "no invented citations");
    assert.equal(parsed.core.quirks, "numbers every drawer");
    assert.equal(parsed.purpose.legacyNotes, "Legacy extra note.");
  });

  it("strips metadata while keeping model-facing prose", () => {
    const profile = parseStoredBotPrompt("").fields;
    profile.identity.role = "debate moderator";
    const stored = serializeStoredBotPrompt(profile, "Ada");

    const stripped = stripBotProfileMetaSuffix(stored);

    assert.match(stripped, /Purpose:\nYou are Ada\./);
    assert.match(stripped, /Identity: debate moderator/);
    assert.doesNotMatch(stripped, /PRISM_BOT_META/);
  });

  it("generates random structured profiles that serialize as V2", () => {
    const profile = randomBotProfile("Kai");
    const prose = composeBotProfileProse(profile, "Kai");
    const stored = serializeStoredBotPrompt(profile, "Kai");

    assert.equal(profile.v, 2);
    assert.match(prose, /Purpose:/);
    assert.match(stored, /"v":2/);
  });

  it("defaults a missing facts section to empty", () => {
    const profile = parseStoredBotPrompt("").fields;

    assert.equal(profile.facts.birthday, "");
    assert.deepEqual(profile.facts.customFacts, []);
  });

  it("round-trips the birthday and custom facts", () => {
    const profile = parseStoredBotPrompt("").fields;
    profile.facts.birthday = "1942-10-29";
    profile.facts.customFacts = [
      { label: "Catchphrase", value: "Happy little trees" },
      { label: "Signature method", value: "Wet-on-wet oil painting" },
    ];

    const stored = serializeStoredBotPrompt(profile, "Bob Ross");
    const parsed = parseStoredBotPrompt(stored).fields;

    const stripRowIds = (facts: BotFactsProfile) => ({
      birthday: facts.birthday,
      customFacts: facts.customFacts.map(({ label, value }) => ({ label, value })),
    });
    assert.deepEqual(stripRowIds(parsed.facts), stripRowIds(profile.facts));
  });

  it("composes facts as canon prose so the model treats them as immutable", () => {
    const profile = parseStoredBotPrompt("").fields;
    profile.facts.birthday = "1942-10-29";
    profile.facts.customFacts = [
      { label: "Catchphrase", value: "Happy little trees" },
    ];

    const prose = composeBotProfileProse(profile, "Bob Ross");

    assert.match(prose, /Permanent facts \(canon, do not contradict\):/);
    assert.match(prose, /Birthday: October 29, 1942/);
    assert.match(prose, /Catchphrase: Happy little trees/);
  });

  it("lists only filled facts, with a stable order and label", () => {
    const profile = parseStoredBotPrompt("").fields;
    profile.facts.birthday = "1942-10-29";
    profile.facts.customFacts = [
      { label: "Catchphrase", value: "Happy little trees" },
      { label: "", value: "" },
    ];

    const list = listBotProfileFacts(profile.facts);

    assert.equal(list[0]?.key, "birthday");
    assert.ok(
      list[1]?.key.startsWith("custom:"),
      "custom fact key should use custom: prefix"
    );
    assert.equal(list[0]?.label, BOT_FACT_KEY_LABELS.birthday);
    assert.equal(list[1]?.label, "Catchphrase");
    assert.equal(list[1]?.value, "Happy little trees");
  });

  it("formats ISO birthdays for display while leaving free-text values alone", () => {
    const profile = parseStoredBotPrompt("").fields;
    profile.facts.birthday = "1942-10-29";

    const rows = listBotProfileFacts(profile.facts);
    const birthday = rows.find((row) => row.key === "birthday");

    assert.ok(birthday, "birthday row should be present");
    assert.equal(birthday?.value, "October 29, 1942");

    // Legacy free-text birthdays must still display literally rather than
    // disappear when the formatter cannot parse them.
    profile.facts.birthday = "an unmarked Tuesday";
    const legacyRows = listBotProfileFacts(profile.facts);
    assert.equal(
      legacyRows.find((row) => row.key === "birthday")?.value,
      "an unmarked Tuesday"
    );
  });

  it("random birthdays are always ISO YYYY-MM-DD when populated", () => {
    let isoCount = 0;
    let populatedCount = 0;
    const trials = 64;
    for (let i = 0; i < trials; i += 1) {
      const profile = randomBotProfile("Random");
      const value = profile.facts.birthday;
      if (!value) continue;
      populatedCount += 1;
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) isoCount += 1;
    }
    assert.ok(populatedCount > 0, "expected at least one populated birthday");
    assert.equal(
      isoCount,
      populatedCount,
      `every populated random birthday should be ISO YYYY-MM-DD; ${populatedCount - isoCount} were not`
    );
  });

  it("randomized profiles populate the Facts section most of the time", () => {
    let withFacts = 0;
    const trials = 64;
    for (let i = 0; i < trials; i += 1) {
      const profile = randomBotProfile("Random");
      const facts = profile.facts;
      const filled = Boolean(
        facts.birthday.trim() || facts.customFacts.length > 0
      );
      if (filled) withFacts += 1;
    }
    // Birthday rolls at 0.85 and custom facts roll independently, so the
    // chance of a single trial producing no facts is well under 15%. Across
    // 64 trials we expect the vast majority to fill something.
    assert.ok(
      withFacts >= trials - 16,
      `Expected at least ${trials - 16} of ${trials} random profiles to fill facts; got ${withFacts}.`
    );
  });

  it("keeps surreal terms limited in a single randomized profile", () => {
    const surrealTerm = /\b(?:eldritch|haunted|ghost|goblin|portal|cryptid|wizard|storm drain|space mall|accordion|cloud dentist|emotional forklift)\b/gi;
    const trials = 96;

    for (let i = 0; i < trials; i += 1) {
      const profile = randomBotProfile("Random");
      const text = [
        profile.purpose.statement,
        profile.core.traits,
        profile.core.interests,
        profile.core.quirks,
        profile.identity.role,
        profile.identity.background,
        profile.appearance.description,
        profile.worldview.values,
      ].join(" ");
      const hits = (text.match(surrealTerm) ?? []).length;
      assert.ok(
        hits <= 1,
        `Expected at most 1 surreal term in a profile, got ${hits}: ${text}`
      );
    }
  });

  it("stays unique across a short randomization burst", () => {
    const signatures = new Set<string>();
    const trials = 18;

    for (let i = 0; i < trials; i += 1) {
      const profile = randomBotProfile("Random");
      signatures.add(
        [
          profile.purpose.statement,
          profile.core.traits,
          profile.identity.role,
          profile.appearance.description,
          profile.worldview.values,
        ]
          .join("|")
          .toLowerCase()
      );
    }

    assert.ok(
      signatures.size >= 14,
      `Expected at least 14 unique profiles in ${trials} rolls; got ${signatures.size}.`
    );
  });

  it("ignores malformed customFacts entries during parse", () => {
    const stored = [
      "Old prose",
      BOT_PROFILE_META_START,
      JSON.stringify({
        v: 2,
        purpose: { statement: "", legacyNotes: "" },
        core: {},
        identity: {},
        worldview: {},
        appearance: {},
        facts: {
          birthday: "1942-10-29",
          customFacts: [
            { label: "Catchphrase", value: "Happy little trees" },
            "not an object",
            { label: "", value: "" },
            null,
          ],
        },
      }),
      BOT_PROFILE_META_END,
    ].join("\n");

    const parsed = parseStoredBotPrompt(stored).fields;

    assert.equal(parsed.facts.birthday, "1942-10-29");
    assert.equal(parsed.facts.customFacts.length, 1);
    assert.equal(parsed.facts.customFacts[0]?.label, "Catchphrase");
    assert.equal(parsed.facts.customFacts[0]?.value, "Happy little trees");
    assert.ok(
      parsed.facts.customFacts[0]?.rowId && parsed.facts.customFacts[0].rowId.length > 0,
      "expected a generated rowId"
    );
  });
});

describe("image persona context", () => {
  it("falls back to the bot name when the stored profile is empty", () => {
    const ctx = buildImagePersonaContext({
      botName: "Pat",
      systemPrompt: "",
      maxChars: 200,
    });
    assert.equal(ctx, "Character: Pat.");
  });

  it("includes appearance and caps long persona prose", () => {
    const fields = structuredClone(DEFAULT_BOT_PROFILE_FIELDS);
    fields.appearance.description = "Tall, silver hair";
    fields.appearance.style = "cozy knits";
    fields.identity.role = "librarian";
    fields.purpose.statement = "x".repeat(400);
    const stored = serializeStoredBotPrompt(fields, "River");
    const ctx = buildImagePersonaContext({
      botName: "River",
      systemPrompt: stored,
      maxChars: 500,
    });
    assert.ok(ctx.includes("River"));
    assert.ok(ctx.includes("librarian"));
    assert.ok(ctx.includes("silver hair"));
    assert.ok(ctx.length <= 500);
    assert.ok(!ctx.includes("x".repeat(300)));
  });

  it("composeAugmentedImagePrompt appends the scene request", () => {
    const fields = structuredClone(DEFAULT_BOT_PROFILE_FIELDS);
    fields.appearance.description = "round glasses";
    const stored = serializeStoredBotPrompt(fields, "Mo");
    const full = composeAugmentedImagePrompt({
      botName: "Mo",
      systemPrompt: stored,
      userPrompt: "reading under a tree",
    });
    assert.ok(full.includes("Scene request: reading under a tree"));
    assert.ok(full.startsWith("Character:"));
  });
});
