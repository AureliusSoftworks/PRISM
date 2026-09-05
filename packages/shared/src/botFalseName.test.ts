import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOT_FALSE_NAME_POOL_V1,
  BOT_SESSION_SURNAME_POOL_V1,
  botFalseNameResponseConflictsV1,
  botFalseNameSelfCueV1,
  botGivenNameFromLibraryNameV1,
  buildBotFalseNameSeedV1,
  createBotFalseNameStateFromSeedV1,
  normalizeBotFalseNameStateV1,
  pickBotFalseNameFromPoolV1,
  pickBotSessionSurnameNameV1,
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

  it("rejects explicit false-name contradictions without rejecting ordinary substance", () => {
    const state = {
      v: 1 as const,
      surface: "signal" as const,
      holderBotId: "alias-1",
      holderBotName: "Alias Allen",
      believedName: "Elowen Thorn",
      sourceMessageId: "turn-2",
      occurredAt: "2026-08-13T15:46:56.980Z",
    };
    assert.equal(
      botFalseNameResponseConflictsV1(
        "As Alias Allen, I believe memory needs room to change.",
        state,
      ),
      true,
    );
    assert.equal(
      botFalseNameResponseConflictsV1(
        "Ah, Elowen Thorn, your wisdom adds depth to our understanding.",
        state,
      ),
      true,
    );
    assert.equal(
      botFalseNameResponseConflictsV1(
        "Memory needs room to change without erasing what mattered.",
        state,
      ),
      false,
    );
    assert.equal(
      rewriteBotFalseNameResponseV1(
        "As Alias Allen, I believe memory needs room to change.",
        state,
        false,
      ),
      "As Elowen Thorn, I believe memory needs room to change.",
    );
  });

  it("keeps the given name and attaches a session surname", () => {
    assert.ok(BOT_SESSION_SURNAME_POOL_V1.length >= 40);
    assert.equal(botGivenNameFromLibraryNameV1("Vex"), "Vex");
    const seed = buildBotFalseNameSeedV1({
      conversationId: "conv-surname",
      holderBotId: "vex",
      pool: "given_plus_random_surname",
    });
    const first = pickBotSessionSurnameNameV1(seed, "Vex");
    const again = pickBotSessionSurnameNameV1(seed, "Vex");
    assert.equal(first, again);
    assert.match(first, /^Vex \S+$/u);
    assert.notEqual(first, "Vex");
    const state = createBotFalseNameStateFromSeedV1({
      surface: "chat",
      holderBotId: "vex",
      holderBotName: "Vex",
      seed,
      pool: "given_plus_random_surname",
      sourceMessageId: "msg-s",
      occurredAt: "2026-08-16T18:00:00.000Z",
    });
    assert.equal(state.pool, "given_plus_random_surname");
    assert.equal(state.believedName, first);
    assert.match(
      botFalseNameSelfCueV1(state.believedName, {
        pool: "given_plus_random_surname",
        holderName: "Vex",
      }),
      /keep answering to "Vex"/iu,
    );
    assert.equal(
      botFalseNameResponseConflictsV1("I am Vex, and that is enough for now.", state),
      false,
    );
    assert.equal(
      botFalseNameResponseConflictsV1("My last name is Placeholder.", state),
      true,
    );
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
