import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_AUDIENCE_GENERATED_ID_PREFIX,
  debateAudienceBotCount,
  debateAudienceBotIsGenerated,
  debateAudienceBotIsPlayerSpectator,
  debateAudienceBotsForSession,
  debateAudienceConversationFacing,
  debateAudienceFrontRowCenterIndex,
  debateAudienceRandom,
  debateAudienceSeatLayout,
  debateAudienceSeatIsTalker,
  debateSpectatorPrismAudienceSeat,
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
    assert.equal(debateAudienceBotCount("low"), 9);
    assert.equal(debateAudienceBotCount("medium"), 13);
    assert.equal(debateAudienceBotCount("high"), 15);
  });

  it("interleaves a slightly smaller rear row behind the foreground audience", () => {
    assert.deepEqual(
      Array.from({ length: 15 }, (_, index) =>
        debateAudienceSeatLayout(index, 15),
      ),
      [
        { depthRow: "front", rowIndex: 0, rowCount: 8 },
        { depthRow: "front", rowIndex: 1, rowCount: 8 },
        { depthRow: "front", rowIndex: 2, rowCount: 8 },
        { depthRow: "front", rowIndex: 3, rowCount: 8 },
        { depthRow: "front", rowIndex: 4, rowCount: 8 },
        { depthRow: "front", rowIndex: 5, rowCount: 8 },
        { depthRow: "front", rowIndex: 6, rowCount: 8 },
        { depthRow: "front", rowIndex: 7, rowCount: 8 },
        { depthRow: "rear", rowIndex: 0, rowCount: 7 },
        { depthRow: "rear", rowIndex: 1, rowCount: 7 },
        { depthRow: "rear", rowIndex: 2, rowCount: 7 },
        { depthRow: "rear", rowIndex: 3, rowCount: 7 },
        { depthRow: "rear", rowIndex: 4, rowCount: 7 },
        { depthRow: "rear", rowIndex: 5, rowCount: 7 },
        { depthRow: "rear", rowIndex: 6, rowCount: 7 },
      ],
    );
  });

  it("pairs neighboring spectators face-to-face with one restrained talker", () => {
    assert.deepEqual(
      Array.from({ length: 7 }, (_, index) =>
        debateAudienceConversationFacing(index, 7),
      ),
      ["right", "left", "right", "left", "right", "left", "left"],
    );
    assert.deepEqual(
      Array.from({ length: 7 }, (_, index) =>
        debateAudienceSeatIsTalker(index, 7),
      ),
      [true, false, false, true, true, false, false],
    );
    assert.equal(debateAudienceSeatIsTalker(0, 1), false);
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

  it("pins Spectator Prism to the front-row center of the gallery", () => {
    assert.equal(debateAudienceFrontRowCenterIndex(9), 2);
    assert.equal(debateAudienceFrontRowCenterIndex(13), 3);
    assert.equal(debateAudienceFrontRowCenterIndex(15), 3);

    const spectatorSeat = debateSpectatorPrismAudienceSeat({
      session: {
        id: "debate-spectator",
        provider: "local",
        model: "llama",
        playerRole: "spectator",
      },
      playerName: "Jared",
    });
    assert.ok(spectatorSeat);
    assert.equal(spectatorSeat!.name, "Jared");
    assert.ok(debateAudienceBotIsPlayerSpectator(spectatorSeat!));
    assert.equal(
      debateSpectatorPrismAudienceSeat({
        session: {
          id: "debate-judge",
          provider: "local",
          model: "llama",
          playerRole: "judge",
        },
      }),
      null,
    );

    const audience = debateAudienceBotsForSession({
      sessionId: "debate-spectator",
      count: 9,
      bots: libraryBots,
      spectatorPrism: spectatorSeat,
    });
    assert.equal(audience.length, 9);
    assert.equal(audience.filter(debateAudienceBotIsPlayerSpectator).length, 1);
    assert.ok(
      debateAudienceBotIsPlayerSpectator(
        audience[debateAudienceFrontRowCenterIndex(9)]!,
      ),
    );
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
