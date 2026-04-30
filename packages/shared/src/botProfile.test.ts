import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOT_PROFILE_META_END,
  BOT_PROFILE_META_START,
  composeBotProfileProse,
  parseStoredBotPrompt,
  randomBotProfile,
  serializeStoredBotPrompt,
  stripBotProfileMetaSuffix,
} from "./botProfile.ts";

describe("bot profile serialization", () => {
  it("round-trips the V2 profile metadata exactly enough for dirty checks", () => {
    const profile = parseStoredBotPrompt("").fields;
    profile.purpose.statement = "a moonlit pollster";
    profile.core.traits = "curious, exacting";
    profile.core.humor = 1;
    profile.identity.species = "android";
    profile.worldview.politicalView = -1;
    profile.appearance.description = "silver coat, tired eyes";

    const stored = serializeStoredBotPrompt(profile, "Mira");
    const parsed = parseStoredBotPrompt(stored).fields;

    assert.deepEqual(parsed, profile);
    assert.equal(serializeStoredBotPrompt(parsed, "Mira"), stored);
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
});
