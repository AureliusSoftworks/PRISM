import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coffeeSessionRetryDraft } from "./coffeeSessionRetry.ts";

describe("Coffee session retry setup", () => {
  it("restores the prior attendance, topic, settings, and duration", () => {
    const draft = coffeeSessionRetryDraft({
      availableBotIds: ["alice", "boris", "cara", "new-guest"],
      groupBotIds: ["alice", "boris", "cara", "new-guest"],
      session: {
        botGroupIds: ["alice", "cara"],
        coffeeAbsentBotIds: ["boris"],
        coffeeSettings: {
          responseLength: "brief",
          crossTalk: "chatty",
        },
        coffeeSessionDurationMinutes: 12,
        coffeeTopic: "  What makes a ritual last?  ",
      },
    });

    assert.deepEqual(draft.excludedBotIds, ["boris", "new-guest"]);
    assert.equal(draft.durationMinutes, 12);
    assert.equal(draft.settings.responseLength, "brief");
    assert.equal(draft.settings.crossTalk, "chatty");
    assert.equal(draft.topic, "What makes a ritual last?");
    assert.deepEqual(draft.missingBotIds, []);
  });

  it("flags unavailable former guests without adding them to the current table", () => {
    const draft = coffeeSessionRetryDraft({
      availableBotIds: ["alice", "cara"],
      groupBotIds: ["alice", "boris", "cara"],
      session: {
        botGroupIds: ["alice", "boris"],
        coffeeSessionDurationMinutes: null,
        coffeeTopic: null,
      },
    });

    assert.deepEqual(draft.excludedBotIds, ["cara"]);
    assert.deepEqual(draft.missingBotIds, ["boris"]);
    assert.equal(draft.durationMinutes, null);
    assert.equal(draft.topic, "");
  });
});
