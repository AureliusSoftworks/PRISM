import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ZEN_RENDERED_MESSAGE_LIMIT,
  zenRenderedMessageWindow,
} from "./zenMessageWindow.ts";

describe("zenRenderedMessageWindow", () => {
  it("keeps the full transcript outside Zen's mounted-message window", () => {
    const source = Array.from({ length: 42 }, (_, index) => `message-${index}`);

    const result = zenRenderedMessageWindow(source, false);

    assert.deepEqual(result.messages, source);
    assert.equal(result.startIndex, 0);
    assert.equal(result.omittedCount, 0);
  });

  it("mounts only the most recent Zen messages without mutating history", () => {
    const source = Array.from(
      { length: ZEN_RENDERED_MESSAGE_LIMIT + 8 },
      (_, index) => `message-${index}`,
    );

    const result = zenRenderedMessageWindow(source, true);

    assert.equal(result.messages.length, ZEN_RENDERED_MESSAGE_LIMIT);
    assert.equal(result.startIndex, 8);
    assert.equal(result.omittedCount, 8);
    assert.equal(result.messages[0], "message-8");
    assert.equal(source.length, ZEN_RENDERED_MESSAGE_LIMIT + 8);
  });

  it("normalizes invalid limits to at least one visible message", () => {
    const result = zenRenderedMessageWindow(["older", "latest"], true, 0);

    assert.deepEqual(result.messages, ["latest"]);
    assert.equal(result.startIndex, 1);
  });
});
