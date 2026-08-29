import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_SIGNAL_LIVE_CAPTIONS_ENABLED,
  normalizeSignalLiveCaptionsEnabled,
  readSignalLiveCaptionSize,
  readSignalLiveCaptionsEnabled,
  writeSignalLiveCaptionSize,
  writeSignalLiveCaptionsEnabled,
} from "./signalLiveCaptionsPreference.ts";

describe("Signal live captions preference", () => {
  it("defaults on and only treats explicit off values as disabled", () => {
    assert.equal(DEFAULT_SIGNAL_LIVE_CAPTIONS_ENABLED, true);
    assert.equal(normalizeSignalLiveCaptionsEnabled(undefined), true);
    assert.equal(normalizeSignalLiveCaptionsEnabled("1"), true);
    assert.equal(normalizeSignalLiveCaptionsEnabled("0"), false);
  });

  it("reads and writes through storage without throwing", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    assert.equal(readSignalLiveCaptionsEnabled(storage), true);
    writeSignalLiveCaptionsEnabled(storage, false);
    assert.equal(readSignalLiveCaptionsEnabled(storage), false);
    assert.equal(readSignalLiveCaptionSize(storage), "medium");
    writeSignalLiveCaptionSize(storage, "large");
    assert.equal(readSignalLiveCaptionSize(storage), "large");
    writeSignalLiveCaptionsEnabled(null, false);
    writeSignalLiveCaptionSize(null, "small");
  });
});
