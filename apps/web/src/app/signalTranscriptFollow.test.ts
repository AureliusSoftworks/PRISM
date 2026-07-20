import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  followSignalTranscriptToBottom,
  signalTranscriptIsNearBottom,
} from "./signalTranscriptFollow.ts";

describe("Signal transcript follow ownership", () => {
  it("keeps following at the bottom and within the re-arm threshold", () => {
    assert.equal(
      signalTranscriptIsNearBottom({
        scrollTop: 500,
        clientHeight: 300,
        scrollHeight: 800,
      }),
      true,
    );
    assert.equal(
      signalTranscriptIsNearBottom({
        scrollTop: 455,
        clientHeight: 300,
        scrollHeight: 800,
      }),
      true,
    );
  });

  it("yields ownership after the producer scrolls meaningfully upward", () => {
    assert.equal(
      signalTranscriptIsNearBottom({
        scrollTop: 360,
        clientHeight: 300,
        scrollHeight: 800,
      }),
      false,
    );
  });

  it("moves to the latest incremental line without smooth-scroll lag", () => {
    const element = { scrollTop: 120, scrollHeight: 920 };
    followSignalTranscriptToBottom(element);
    assert.equal(element.scrollTop, 920);
  });
});
