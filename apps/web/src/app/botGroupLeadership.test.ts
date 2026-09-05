import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  botGroupLeadershipCount,
} from "./botGroupLeadership.ts";

describe("bot group leadership", () => {
  it("counts only groups currently led by the bot", () => {
    const groups = [
      { leaderBotId: "hector" },
      { leaderBotId: "hector" },
      { leaderBotId: "connie" },
      { leaderBotId: null },
    ];
    assert.equal(botGroupLeadershipCount(groups, "hector"), 2);
    assert.equal(botGroupLeadershipCount(groups, "connie"), 1);
    assert.equal(botGroupLeadershipCount(groups, "missing"), 0);
    assert.equal(
      botGroupLeadershipCount(
        [
          { leaderBotId: "hector" },
          { leaderBotId: "hector" },
          { leaderBotId: "hector" },
          { leaderBotId: "hector" },
          { leaderBotId: "hector" },
          { leaderBotId: "hector" },
        ],
        "hector",
      ),
      6,
    );
  });
});
