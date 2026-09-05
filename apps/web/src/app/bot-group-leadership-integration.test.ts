import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const miniSource = readFileSync(
  new URL("./chatMiniBotAvatar.tsx", import.meta.url),
  "utf8",
);

describe("Library group leader integration", () => {
  it("offers exclusive promotion from a group-scoped bot context menu", () => {
    assert.match(pageSource, /label: "Promote to leader"/u);
    assert.match(
      pageSource,
      /promoteBotLibraryGroupLeader\(group\.id, bot\.id\)/u,
    );
    assert.match(pageSource, /leaderBotId: botId/u);
  });

  it("keeps leadership semantic without adding visual badges to bots", () => {
    assert.match(
      pageSource,
      /activeBotLibraryGroupFilter\?\.leaderBotId === b\.id/u,
    );
    assert.match(pageSource, /`leader of \$\{activeBotLibraryGroupFilter\.name\}`/u);
    assert.doesNotMatch(pageSource, /botGroupLeaderCrown|botCardLeaderCrown/u);
    assert.doesNotMatch(pageSource, /<BotGroupLeadershipMark/u);
    assert.doesNotMatch(miniSource, /<BotGroupLeadershipMark/u);
  });
});
