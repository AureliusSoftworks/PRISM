import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMemoryListQueryOptions } from "../memory-list-query.ts";

describe("parseMemoryListQueryOptions", () => {
  it("returns defaults when query is empty", () => {
    const options = parseMemoryListQueryOptions(new URLSearchParams());
    assert.equal(options.botId, null);
    assert.equal(options.conversationId, null);
    assert.equal(options.scope, null);
    assert.equal(options.inferBotMemories, true);
    assert.equal(options.limit, 100);
  });

  it("disables inference only when infer=false", () => {
    const disabled = parseMemoryListQueryOptions(new URLSearchParams("botId=bot-1&infer=false"));
    const enabled = parseMemoryListQueryOptions(new URLSearchParams("botId=bot-1&infer=true"));
    assert.equal(disabled.inferBotMemories, false);
    assert.equal(enabled.inferBotMemories, true);
  });

  it("clamps limit into a safe range", () => {
    const low = parseMemoryListQueryOptions(new URLSearchParams("limit=0"));
    const high = parseMemoryListQueryOptions(new URLSearchParams("limit=999"));
    const valid = parseMemoryListQueryOptions(new URLSearchParams("limit=3"));
    assert.equal(low.limit, 1);
    assert.equal(high.limit, 100);
    assert.equal(valid.limit, 3);
  });
});
