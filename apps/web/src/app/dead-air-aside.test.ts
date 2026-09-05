import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDeadAirAsidePlanV1,
  coffeeDeadAirAsideShouldAttempt,
  COFFEE_DEAD_AIR_ASIDE_CHANCE,
  COFFEE_DEAD_AIR_ASIDE_MIN_TURN_GAP,
} from "./deadAirAside.ts";

describe("dead-air aside planning", () => {
  it("is deterministic and keeps the thinking bot out of the commentator seat", () => {
    const args = {
      mode: "coffee" as const,
      turnId: "episode-1:message-4:guest",
      thinkingBotId: "guest-1",
      thinkingBotName: "Ivo Stone",
      commentatorBotId: "host-1",
      mood: "guarded" as const,
      temperament: "analytical" as const,
    };
    assert.deepEqual(
      buildDeadAirAsidePlanV1(args),
      buildDeadAirAsidePlanV1(args),
    );
    assert.equal(
      buildDeadAirAsidePlanV1({
        ...args,
        commentatorBotId: args.thinkingBotId,
      }),
      null,
    );
  });

  it("changes the performance line with mood while preserving persona flavor", () => {
    const base = {
      mode: "coffee" as const,
      turnId: "job-7",
      thinkingBotId: "bot-2",
      thinkingBotName: "Mara",
      commentatorBotId: "bot-1",
      temperament: "inventive" as const,
    };
    const warm = buildDeadAirAsidePlanV1({ ...base, mood: "warm" });
    const strained = buildDeadAirAsidePlanV1({ ...base, mood: "strained" });
    assert.ok(warm);
    assert.ok(strained);
    assert.notEqual(warm.text, strained.text);
    assert.match(warm.text, /prototype|Mara|thoughts|pause|busy|words/iu);
    assert.match(strained.text, /prototype|Mara|pause|lawyer|Clock/iu);
  });

  it("avoids repeating recent lines when another variant exists", () => {
    const args = {
      mode: "coffee" as const,
      turnId: "job-9",
      thinkingBotId: "bot-2",
      thinkingBotName: "Mara",
      commentatorBotId: "bot-1",
      mood: "neutral" as const,
      temperament: "neutral" as const,
    };
    const first = buildDeadAirAsidePlanV1(args);
    assert.ok(first);
    const second = buildDeadAirAsidePlanV1({
      ...args,
      recentTexts: [first!.text],
      varietySalt: 1,
    });
    assert.ok(second);
    assert.notEqual(second.text, first!.text);
  });

  it("keeps asides sparse across turns", () => {
    assert.equal(
      coffeeDeadAirAsideShouldAttempt({
        turnId: "turn-a",
        assistantTurnCount: 4,
        lastAsideAssistantTurnCount: 3,
      }),
      false,
    );
    assert.ok(COFFEE_DEAD_AIR_ASIDE_MIN_TURN_GAP >= 3);
    assert.ok(COFFEE_DEAD_AIR_ASIDE_CHANCE < 0.5);
    const allowed = coffeeDeadAirAsideShouldAttempt({
      turnId: "turn-b-sparse-check",
      assistantTurnCount: 10,
      lastAsideAssistantTurnCount: null,
      chance: 1,
    });
    assert.equal(allowed, true);
  });
});
