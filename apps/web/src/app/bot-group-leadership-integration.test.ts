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

  it("marks the current group leader with a crown on dashboard cards", () => {
    assert.match(
      pageSource,
      /activeBotLibraryGroupFilter\?\.leaderBotId === b\.id/u,
    );
    assert.match(pageSource, /className=\{styles\.botGroupLeaderCrown\}/u);
    assert.match(pageSource, /className=\{styles\.botCardLeaderCrown\}/u);
  });

  it("shares the Effort-shaped leadership mark across full and mini chassis", () => {
    assert.match(
      pageSource,
      /<BotGroupLeadershipMark[\s\S]*?surface="full"/u,
    );
    assert.match(
      miniSource,
      /<BotGroupLeadershipMark[\s\S]*?surface="mini"/u,
    );
    assert.match(pageSource, /leadershipGroupCount=\{/u);
    assert.match(
      pageSource,
      /leadershipGroupCount=\{botGroupLeadershipCount\([\s\S]*?botLibraryGroups/u,
    );
  });
});
