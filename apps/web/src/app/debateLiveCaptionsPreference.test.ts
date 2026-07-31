import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_DEBATE_LIVE_CAPTIONS_ENABLED,
  normalizeDebateLiveCaptionsEnabled,
  readDebateLiveCaptionsEnabled,
  writeDebateLiveCaptionsEnabled,
} from "./debateLiveCaptionsPreference.ts";

describe("Debate live captions preference", () => {
  it("defaults on and only treats explicit off values as disabled", () => {
    assert.equal(DEFAULT_DEBATE_LIVE_CAPTIONS_ENABLED, true);
    assert.equal(normalizeDebateLiveCaptionsEnabled(null), true);
    assert.equal(normalizeDebateLiveCaptionsEnabled("1"), true);
    assert.equal(normalizeDebateLiveCaptionsEnabled("0"), false);
    assert.equal(normalizeDebateLiveCaptionsEnabled("false"), false);
  });

  it("reads and writes through storage without throwing", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    assert.equal(readDebateLiveCaptionsEnabled(storage), true);
    writeDebateLiveCaptionsEnabled(storage, false);
    assert.equal(readDebateLiveCaptionsEnabled(storage), false);
    writeDebateLiveCaptionsEnabled(storage, true);
    assert.equal(readDebateLiveCaptionsEnabled(storage), true);
    assert.equal(readDebateLiveCaptionsEnabled(null), true);
  });
});
