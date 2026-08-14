import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOT_FOUNDRY_BATCH_MAX_COUNT,
  BOT_FOUNDRY_BATCH_MIN_COUNT,
  BOT_FOUNDRY_INSPIRATION_MAX_SOURCES,
  BOT_FOUNDRY_LEAN_BATCH_MIN_COUNT,
  botFoundryBatchIsLean,
  botFoundryGenerationContextInstruction,
  botFoundryPowerBudgetInstruction,
  explicitBotFoundryPowerCountFromBrief,
  normalizeBotFoundryGenerationContextV1,
  normalizeBotFoundryBatchGroupIdentityV1,
  resolveBotFoundryGenerationContextForBriefV1,
  resolveBotFoundryPowerOptionsForBriefV1,
  uniqueBotFoundryBatchGroupName,
} from "./botFoundryCreation.ts";

describe("Bot Foundry creation contracts", () => {
  it("divides one fixed Power budget across one, two, or three Powers", () => {
    assert.match(
      botFoundryPowerBudgetInstruction({ enabled: true, count: 1, craziness: 25 }),
      /exactly 1 distinct strong Power/u,
    );
    assert.match(
      botFoundryPowerBudgetInstruction({ enabled: true, count: 2, craziness: 50 }),
      /exactly 2 distinct moderate Powers/u,
    );
    assert.match(
      botFoundryPowerBudgetInstruction({ enabled: true, count: 3, craziness: 90 }),
      /exactly 3 distinct weak compound Powers/u,
    );
    assert.match(
      botFoundryPowerBudgetInstruction({ enabled: true, count: 3, craziness: 90 }),
      /interlock into one powerful compound kit/u,
    );
    assert.match(
      botFoundryPowerBudgetInstruction({ enabled: true, count: 1, craziness: 90 }),
      /Social influence \/ craziness is 90\/100/u,
    );
    assert.match(
      botFoundryPowerBudgetInstruction({ enabled: false, count: 3, craziness: 90 }),
      /empty array/u,
    );
  });

  it("bounds Inspire to five sources and preserves independent influence", () => {
    const context = normalizeBotFoundryGenerationContextV1({
      mode: "inspire",
      resemblance: 140,
      inspirationSources: Array.from({ length: 7 }, (_, index) => ({
        id: `bot-${index}`,
        name: `Bot ${index}`,
        influence: index === 0 ? -20 : index * 20,
        essence: `Essence ${index}`,
      })),
    });
    assert.equal(context.inspirationSources.length, BOT_FOUNDRY_INSPIRATION_MAX_SOURCES);
    assert.equal(context.inspirationSources[0]?.influence, 0);
    assert.equal(context.inspirationSources[4]?.influence, 80);
    assert.equal(context.resemblance, 100);
    assert.match(botFoundryGenerationContextInstruction(context), /without cloning names, exact identities/u);
  });

  it("deduplicates repeated Inspire source identities", () => {
    const context = normalizeBotFoundryGenerationContextV1({
      mode: "inspire",
      inspirationSources: [
        { id: "same", name: "First", influence: 80 },
        { id: "same", name: "Duplicate", influence: 10 },
      ],
    });
    assert.deepEqual(
      context.inspirationSources.map((source) => [source.id, source.name, source.influence]),
      [["same", "First", 80]],
    );
  });

  it("bounds Batch and names the automatic rich or lean position", () => {
    const low = normalizeBotFoundryGenerationContextV1({
      mode: "batch",
      batchCount: 1,
      batchIndex: -2,
    });
    const high = normalizeBotFoundryGenerationContextV1({
      mode: "batch",
      batchCount: 140,
      batchIndex: 199,
    });
    assert.equal(low.batchCount, BOT_FOUNDRY_BATCH_MIN_COUNT);
    assert.equal(low.batchIndex, 1);
    assert.equal(high.batchCount, BOT_FOUNDRY_BATCH_MAX_COUNT);
    assert.equal(high.batchIndex, BOT_FOUNDRY_BATCH_MAX_COUNT);
    assert.match(botFoundryGenerationContextInstruction(high), /lean automatic bot 100 of 100/u);
    assert.match(botFoundryGenerationContextInstruction(high), /clearly distinct from plausible siblings/u);
    assert.match(
      botFoundryGenerationContextInstruction(
        normalizeBotFoundryGenerationContextV1({
          mode: "batch",
          batchCount: 3,
          batchIndex: 2,
          powers: { enabled: true, count: 2, craziness: 70 },
        }),
      ),
      /rich automatic bot 2 of 3/u,
    );
  });

  it("accepts 2-100 and forces every 11-100 batch onto the lean no-Power contract", () => {
    const rich = resolveBotFoundryGenerationContextForBriefV1(
      {
        mode: "batch",
        batchCount: BOT_FOUNDRY_LEAN_BATCH_MIN_COUNT - 1,
        powers: { enabled: true, count: 2, craziness: 80 },
      },
      "Give each bot two Powers.",
    );
    const lean = resolveBotFoundryGenerationContextForBriefV1(
      {
        mode: "batch",
        batchCount: BOT_FOUNDRY_BATCH_MAX_COUNT,
        powers: { enabled: true, count: 3, craziness: 100 },
      },
      "Give every bot three Powers.",
    );
    assert.equal(rich.batchCount, 10);
    assert.equal(rich.powers.enabled, true);
    assert.equal(lean.batchCount, 100);
    assert.equal(lean.powers.enabled, false);
    assert.equal(botFoundryBatchIsLean(rich), false);
    assert.equal(botFoundryBatchIsLean(lean), true);
    assert.match(botFoundryGenerationContextInstruction(lean), /Return no Powers/u);
  });

  it("normalizes LLM group identity and makes a generated name unique without replacing it", () => {
    assert.deepEqual(
      normalizeBotFoundryBatchGroupIdentityV1({
        name: "  Midnight Cartographers  ",
        description: "  A cohort of patient mapmakers.  ",
      }),
      {
        name: "Midnight Cartographers",
        description: "A cohort of patient mapmakers.",
      },
    );
    assert.equal(
      uniqueBotFoundryBatchGroupName(
        "Midnight Cartographers",
        ["midnight cartographers", "Midnight Cartographers (2)"],
      ),
      "Midnight Cartographers (3)",
    );
    assert.equal(uniqueBotFoundryBatchGroupName("", []), "");
  });

  it("preserves an enabled structured Power count over a conflicting brief", () => {
    assert.deepEqual(
      resolveBotFoundryPowerOptionsForBriefV1(
        { enabled: true, count: 3, craziness: 60 },
        "Do not give this bot any Powers.",
      ),
      { enabled: true, count: 3, craziness: 60 },
    );
  });

  it("auto-enables an explicitly requested named Power despite an additional-Powers boundary", () => {
    const brief = "Give him exactly one Power named Cursed Tongue. Do not give Curtis any additional Powers.";
    assert.equal(explicitBotFoundryPowerCountFromBrief(brief), 1);
    assert.deepEqual(
      resolveBotFoundryGenerationContextForBriefV1(
        { powers: { enabled: false, count: 3, craziness: 50 } },
        brief,
      ).powers,
      { enabled: true, count: 1, craziness: 50 },
    );
  });

  it("detects explicit one, two, and three-Power grants without treating ordinary power as a Power", () => {
    assert.equal(explicitBotFoundryPowerCountFromBrief("Grant her two Powers."), 2);
    assert.equal(explicitBotFoundryPowerCountFromBrief("He should be granted exactly three Powers."), 3);
    assert.equal(explicitBotFoundryPowerCountFromBrief("Give them a Power called Lantern Voice."), 1);
    assert.equal(explicitBotFoundryPowerCountFromBrief("Exactly two Powers named Night Lantern and Safe Harbor."), 2);
    for (const brief of [
      "Do not give her any Powers.",
      "Do not give him exactly one Power.",
      "Never grant her two Powers.",
      "He must not be given three Powers.",
      "His power comes from electricity.",
      "She has an ordinary talent for mimicry.",
      "Give him an ordinary ability to organize files.",
    ]) {
      assert.equal(explicitBotFoundryPowerCountFromBrief(brief), null, brief);
    }
    assert.deepEqual(
      resolveBotFoundryPowerOptionsForBriefV1(
        { enabled: false, count: 2, craziness: 50 },
        "Do not give her any Powers.",
      ),
      { enabled: false, count: 2, craziness: 50 },
    );
  });
});
