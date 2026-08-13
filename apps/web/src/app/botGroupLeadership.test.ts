import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  botGroupLeadershipCount,
  botGroupLeadershipEffort,
  botGroupLeadershipIconPath,
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

  it("maps group count onto the existing one-through-five point effort ladder", () => {
    assert.equal(botGroupLeadershipEffort(0), null);
    assert.equal(botGroupLeadershipEffort(1), "minimal");
    assert.equal(botGroupLeadershipEffort(2), "low");
    assert.equal(botGroupLeadershipEffort(3), "medium");
    assert.equal(botGroupLeadershipEffort(4), "high");
    assert.equal(botGroupLeadershipEffort(5), "xhigh");
    assert.equal(botGroupLeadershipEffort(12), "xhigh");
    assert.equal(
      botGroupLeadershipIconPath(3),
      "/reasoning-effort/medium.svg",
    );
  });
});
