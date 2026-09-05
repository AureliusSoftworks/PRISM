import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { BOT_LIBRARY_GROUP_MEMBER_MAX } from "@localai/shared";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Library group capacity", () => {
  it("uses the shared 100-member cap across UI validation and the manager flow", () => {
    assert.equal(BOT_LIBRARY_GROUP_MEMBER_MAX, 100);
    assert.match(
      pageSource,
      /const BOT_LIBRARY_GROUP_BOT_CAP = BOT_LIBRARY_GROUP_MEMBER_MAX/u,
    );
    assert.match(pageSource, /group\.botIds\.length >= BOT_LIBRARY_GROUP_BOT_CAP/u);
    assert.match(pageSource, /group\.botIds\.length > BOT_LIBRARY_GROUP_BOT_CAP/u);
    assert.match(
      pageSource,
      /selectedMemberCount >= BOT_LIBRARY_GROUP_BOT_CAP/u,
    );
  });
});
