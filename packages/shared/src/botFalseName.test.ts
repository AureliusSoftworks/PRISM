import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOT_FALSE_NAME_POOL_V1,
  botFalseNameSelfCueV1,
  buildBotFalseNameSeedV1,
  createBotFalseNameStateFromSeedV1,
  normalizeBotFalseNameStateV1,
  pickBotFalseNameFromPoolV1,
  rewriteBotFalseNameResponseV1,
} from "./botFalseName.ts";

describe("botFalseName", () => {
  it("keeps a mixed pool of first names, nicknames, full names, and mythical aliases", () => {
    assert.ok(BOT_FALSE_NAME_POOL_V1.length >= 80);
    assert.ok(BOT_FALSE_NAME_POOL_V1.includes("Alex"));
    assert.ok(BOT_FALSE_NAME_POOL_V1.includes("Sparky"));
    assert.ok(BOT_FALSE_NAME_POOL_V1.includes("Jordan Hale"));
    assert.ok(BOT_FALSE_NAME_POOL_V1.includes("Zephyr Moonwhisper"));
  });

  it("picks the same believed name for the same seed", () => {
    const seed = buildBotFalseNameSeedV1({
      conversationId: "conv-1",
      holderBotId: "bot-1",
    });
    assert.equal(pickBotFalseNameFromPoolV1(seed), pickBotFalseNameFromPoolV1(seed));
  });

  it("reshuffles when the amnesia token changes", () => {
    const sticky = pickBotFalseNameFromPoolV1(
      buildBotFalseNameSeedV1({
        conversationId: "conv-1",
        holderBotId: "bot-1",
      }),
    );
    const afterAmnesia = pickBotFalseNameFromPoolV1(
      buildBotFalseNameSeedV1({
        conversationId: "conv-1",
        holderBotId: "bot-1",
        reshuffleToken: "3:msg-9",
      }),
    );
    // Extremely unlikely to collide across a large pool; still allow equality
    // only if hash happens to collide — assert seed strings differ.
    assert.notEqual(
      buildBotFalseNameSeedV1({
        conversationId: "conv-1",
        holderBotId: "bot-1",
      }),
      buildBotFalseNameSeedV1({
        conversationId: "conv-1",
        holderBotId: "bot-1",
        reshuffleToken: "3:msg-9",
      }),
    );
    assert.ok(sticky.length > 0);
    assert.ok(afterAmnesia.length > 0);
  });

  it("normalizes and rewrites Library-name self claims", () => {
    const state = createBotFalseNameStateFromSeedV1({
      surface: "coffee",
      holderBotId: "bot-1",
      holderBotName: "Forgetful Freddie",
      seed: "seed-a",
      sourceMessageId: "msg-1",
      occurredAt: "2026-07-25T12:00:00.000Z",
    });
    assert.equal(normalizeBotFalseNameStateV1(state)?.believedName, state.believedName);
    const rewritten = rewriteBotFalseNameResponseV1(
      "I am Forgetful Freddie and I just sat down.",
      state,
      true,
    );
    assert.match(rewritten, new RegExp(state.believedName, "u"));
    assert.doesNotMatch(rewritten, /Forgetful Freddie/u);
    const mirrored = rewriteBotFalseNameResponseV1(
      "I am Scatterbrained Steven, and that other Steven is the impostor.",
      state,
      true,
      { replacedSelfNames: ["Scatterbrained Steven"] },
    );
    assert.match(mirrored, new RegExp(`I am ${state.believedName}`, "u"));
    assert.doesNotMatch(mirrored, /I am Scatterbrained Steven/u);
    assert.match(mirrored, /other Steven is the impostor/u);
  });

  it("lets a fresh alias surface naturally without forcing a correction", () => {
    const state = createBotFalseNameStateFromSeedV1({
      surface: "signal",
      holderBotId: "bot-1",
      holderBotName: "Scatterbrained Steven",
      seed: "seed-b",
      sourceMessageId: "msg-2",
      occurredAt: "2026-07-26T07:38:39.624Z",
    });
    const cue = botFalseNameSelfCueV1(state.believedName);
    assert.match(cue, /only when the current exchange makes identity relevant/iu);
    assert.match(cue, /do not volunteer a correction or reintroduce yourself/iu);
    assert.equal(
      rewriteBotFalseNameResponseV1(
        "Kindness deserves remembering even when the details slip away.",
        state,
        true,
        { announceIdentityOnChange: false },
      ),
      "Kindness deserves remembering even when the details slip away.",
    );
  });
});
