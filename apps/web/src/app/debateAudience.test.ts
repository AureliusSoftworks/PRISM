import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_AUDIENCE_GENERATED_ID_PREFIX,
  debateAudienceBotCount,
  debateAudienceBotIsGenerated,
  debateAudienceBotsForSession,
  debateAudienceRandom,
} from "./debateAudience.ts";

const libraryBots = [
  {
    id: "bot-a",
    name: "A",
    color: "#111111",
    glyph: "circle",
    systemPrompt: "library persona A",
  },
  {
    id: "bot-b",
    name: "B",
    color: "#222222",
    glyph: "square",
    systemPrompt: "library persona B",
  },
  {
    id: "bot-c",
    name: "C",
    color: "#333333",
    glyph: "triangle",
    systemPrompt: "library persona C",
  },
] as const;

describe("Debate audience casting", () => {
  it("uses more reduced-detail spectators when graphics headroom allows", () => {
    assert.equal(debateAudienceBotCount("low"), 5);
    assert.equal(debateAudienceBotCount("medium"), 7);
    assert.equal(debateAudienceBotCount("high"), 8);
  });

  it("selects stable, distinct Library spectators outside the active cast", () => {
    const args = {
      sessionId: "debate-1",
      count: 2,
      bots: libraryBots,
      excludedBotIds: ["bot-b"],
    } as const;
    const first = debateAudienceBotsForSession(args);
    const second = debateAudienceBotsForSession(args);

    assert.deepEqual(first, second);
    assert.equal(first.length, 2);
    assert.equal(new Set(first.map((bot) => bot.id)).size, 2);
    assert.ok(first.every((bot) => bot.id !== "bot-b"));
    assert.ok(first.every((bot) => !debateAudienceBotIsGenerated(bot)));
  });

  it("fills Library shortages with appearance-only session spectators", () => {
    const audience = debateAudienceBotsForSession({
      sessionId: "debate-short-library",
      count: 5,
      bots: libraryBots.slice(0, 1),
    });
    const generated = audience.filter(debateAudienceBotIsGenerated);

    assert.equal(audience.length, 5);
    assert.equal(generated.length, 4);
    for (const bot of generated) {
      assert.match(
        bot.id,
        new RegExp(`^${DEBATE_AUDIENCE_GENERATED_ID_PREFIX}`),
      );
      assert.equal(bot.systemPrompt, "");
      assert.equal(bot.avatarDetails, null);
      assert.equal(bot.voiceProfile, null);
      assert.deepEqual(bot.powers, []);
    }
  });

  it("provides a deterministic appearance randomizer for generated faces", () => {
    const first = debateAudienceRandom("generated-face");
    const second = debateAudienceRandom("generated-face");
    const firstSamples = Array.from({ length: 8 }, () => first());
    const secondSamples = Array.from({ length: 8 }, () => second());

    assert.deepEqual(firstSamples, secondSamples);
    assert.ok(firstSamples.every((sample) => sample >= 0 && sample < 1));
    assert.ok(new Set(firstSamples).size > 1);
  });
});
