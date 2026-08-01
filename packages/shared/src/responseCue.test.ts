import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_RESPONSE_CUE_EXPLICIT_COOLDOWN_MS,
  BOT_RESPONSE_CUE_MAX_PHRASES,
  BOT_RESPONSE_CUE_WAIT_DELAY_MS,
  heardBotPresenceBeatTextV1,
  normalizeBotResponseCuePhraseV1,
  normalizeBotResponseCueProfileV1,
  responseCueCandidatesV1,
  selectBotResponseCueV1,
  type BotResponseCueSelectionInputV1,
} from "./responseCue.ts";

function baseInput(
  patch: Partial<BotResponseCueSelectionInputV1> = {},
): BotResponseCueSelectionInputV1 {
  return {
    botId: "bot-1",
    responseId: "response-1",
    trigger: "interruption",
    communicationStyle: "neutral",
    nowMs: 20_000,
    voiceActive: true,
    audible: true,
    clipReady: true,
    ...patch,
  };
}

describe("bot response cues", () => {
  it("normalizes whitespace and rejects overlong phrases", () => {
    assert.equal(normalizeBotResponseCuePhraseV1("  Okay,   then.  "), "Okay, then.");
    assert.equal(
      normalizeBotResponseCuePhraseV1("one two three four five six seven eight nine"),
      null,
    );
    assert.equal(normalizeBotResponseCuePhraseV1("x".repeat(49)), null);
  });

  it("caps, deduplicates, and safely normalizes authored profiles", () => {
    const profile = normalizeBotResponseCueProfileV1({
      enabled: true,
      interruption: [
        "Okay.",
        " okay. ",
        "One.",
        "Two.",
        "Three.",
        "Four.",
        "Five.",
        "Six.",
        "Seven.",
      ],
      redirect: "invalid",
      waiting: ["one two three four five six seven eight nine"],
      blockedDefaults: ["Right."],
    });

    assert.ok(profile);
    assert.equal(profile.interruption.length, BOT_RESPONSE_CUE_MAX_PHRASES);
    assert.equal(profile.interruption[0], "Okay.");
    assert.deepEqual(profile.redirect, []);
    assert.deepEqual(profile.waiting, []);
    assert.deepEqual(profile.blockedDefaults, ["Right."]);
  });

  it("uses custom category overrides and removes blocked phrases globally", () => {
    const input = baseInput({
      profile: {
        v: 1,
        enabled: true,
        interruption: ["Custom one.", "Never this."],
        redirect: [],
        waiting: [],
        blockedDefaults: ["never this."],
      },
    });

    assert.deepEqual(responseCueCandidatesV1(input), [
      { phrase: "Custom one.", source: "custom" },
    ]);
    assert.ok(
      responseCueCandidatesV1({ ...input, trigger: "redirect" }).every(
        ({ source }) => source === "default",
      ),
    );
  });

  it("selects deterministically while avoiding a bot's last four phrases", () => {
    const input = baseInput({
      profile: {
        v: 1,
        enabled: true,
        interruption: ["First.", "Second.", "Third.", "Fourth.", "Fifth."],
        redirect: [],
        waiting: [],
        blockedDefaults: [],
      },
      recentPhrases: ["First.", "Second.", "Third.", "Fourth."],
    });
    const first = selectBotResponseCueV1(input);
    assert.deepEqual(first, selectBotResponseCueV1(input));
    assert.equal(first.selected, true);
    if (first.selected) assert.equal(first.cue.phrase, "Fifth.");
  });

  it("enforces explicit and ordinary-wait cooldowns", () => {
    assert.deepEqual(
      selectBotResponseCueV1(
        baseInput({ lastCueAtMs: 20_000 - BOT_RESPONSE_CUE_EXPLICIT_COOLDOWN_MS + 1 }),
      ),
      { selected: false, reason: "cooldown" },
    );
    assert.deepEqual(
      selectBotResponseCueV1(
        baseInput({ trigger: "waiting", waitingElapsedMs: BOT_RESPONSE_CUE_WAIT_DELAY_MS - 1 }),
      ),
      { selected: false, reason: "too_early" },
    );
    assert.deepEqual(
      selectBotResponseCueV1(
        baseInput({
          trigger: "waiting",
          waitingElapsedMs: BOT_RESPONSE_CUE_WAIT_DELAY_MS,
          completedTurnsSinceCue: 2,
        }),
      ),
      { selected: false, reason: "cooldown" },
    );
  });

  it("uses a stable 35 percent ordinary-wait eligibility roll", () => {
    const decisions = Array.from({ length: 2_000 }, (_, index) =>
      selectBotResponseCueV1(
        baseInput({
          responseId: `response-${index}`,
          trigger: "waiting",
          waitingElapsedMs: BOT_RESPONSE_CUE_WAIT_DELAY_MS,
          completedTurnsSinceCue: 3,
        }),
      ),
    );
    const selected = decisions.filter((decision) => decision.selected).length;
    assert.ok(selected / decisions.length > 0.32);
    assert.ok(selected / decisions.length < 0.38);
  });

  it("gates inaudible, unready, exact, and procedural responses", () => {
    assert.deepEqual(selectBotResponseCueV1(baseInput({ audible: false })), {
      selected: false,
      reason: "inaudible",
    });
    assert.deepEqual(selectBotResponseCueV1(baseInput({ clipReady: false })), {
      selected: false,
      reason: "clip_not_ready",
    });
    assert.deepEqual(selectBotResponseCueV1(baseInput({ exactResponseRequired: true })), {
      selected: false,
      reason: "semantic_or_procedural_audio",
    });
    assert.deepEqual(selectBotResponseCueV1(baseInput({ proceduralAudioActive: true })), {
      selected: false,
      reason: "semantic_or_procedural_audio",
    });
  });

  it("projects only the heard prefix of persisted presence beats", () => {
    assert.equal(
      heardBotPresenceBeatTextV1({ text: "…Okay, then.", heardCharacterCount: 5 }),
      "…Okay",
    );
    assert.equal(heardBotPresenceBeatTextV1({ text: "Okay.", heardCharacterCount: 99 }), "Okay.");
  });
});
