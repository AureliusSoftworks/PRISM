import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_LIVE_CAPTION_SIZE,
  liveCaptionSizeDetails,
  normalizeLiveCaptionSize,
  readLiveCaptionSize,
  stepLiveCaptionSize,
  writeLiveCaptionSize,
} from "./liveCaptionSize.ts";

describe("live caption size", () => {
  it("normalizes to the medium default and steps through bounded sizes", () => {
    assert.equal(DEFAULT_LIVE_CAPTION_SIZE, "medium");
    assert.equal(normalizeLiveCaptionSize(undefined), "medium");
    assert.equal(normalizeLiveCaptionSize("large"), "large");
    assert.equal(normalizeLiveCaptionSize("enormous"), "medium");
    assert.equal(stepLiveCaptionSize("small", -1), "small");
    assert.equal(stepLiveCaptionSize("medium", 1), "large");
    assert.equal(stepLiveCaptionSize("extra-large", 1), "extra-large");
    assert.deepEqual(liveCaptionSizeDetails("large"), {
      label: "Large",
      percent: 120,
    });
  });

  it("reads and writes a caller-owned applet storage key safely", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    assert.equal(readLiveCaptionSize(storage, "captions"), "medium");
    writeLiveCaptionSize(storage, "captions", "extra-large");
    assert.equal(readLiveCaptionSize(storage, "captions"), "extra-large");
    assert.equal(readLiveCaptionSize(null, "captions"), "medium");
    writeLiveCaptionSize(null, "captions", "small");
  });
});
