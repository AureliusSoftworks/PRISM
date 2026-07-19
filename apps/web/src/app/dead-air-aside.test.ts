import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDeadAirAsidePlanV1 } from "./deadAirAside.ts";

describe("dead-air aside planning", () => {
  it("is deterministic and keeps the thinking bot out of the commentator seat", () => {
    const args = {
      mode: "signal" as const,
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
    assert.match(warm.text, /prototype/u);
    assert.match(strained.text, /prototype/u);
  });
});
