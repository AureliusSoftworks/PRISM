import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  autoFallbackAvailableForPrimary,
  autoFallbackChainWithEntry,
  autoFallbackResponseModeForSend,
  decodeAutoFallbackPickerValue,
  encodeAutoFallbackPickerValue,
} from "./autoFallbackSettings.ts";

const local = { provider: "local" as const, model: "qwen3:8b" };
const openai = { provider: "openai" as const, model: "gpt-5-mini" };
const anthropic = { provider: "anthropic" as const, model: "claude-haiku-4-5" };

describe("Auto fallback settings", () => {
  it("round-trips combined picker values", () => {
    assert.deepEqual(decodeAutoFallbackPickerValue(encodeAutoFallbackPickerValue(openai)), openai);
  });

  it("fills the other fallback with a distinct runnable model", () => {
    assert.deepEqual(
      autoFallbackChainWithEntry({ chain: null, index: 0, next: local, available: [local, openai] }),
      { v: 1, fallbacks: [local, openai] }
    );
  });

  it("requires three distinct runnable models", () => {
    const chain = { v: 1 as const, fallbacks: [openai, anthropic] as [typeof openai, typeof anthropic] };
    assert.equal(
      autoFallbackAvailableForPrimary({ primary: local, chain, runnable: [local, openai, anthropic] }),
      true
    );
    assert.equal(
      autoFallbackAvailableForPrimary({ primary: openai, chain, runnable: [local, openai, anthropic] }),
      false
    );
  });

  it("does not send Auto when the contextual primary duplicates a fallback", () => {
    const chain = {
      v: 1 as const,
      fallbacks: [openai, anthropic] as [typeof openai, typeof anthropic],
    };
    const runnable = [local, openai, anthropic];

    assert.equal(
      autoFallbackResponseModeForSend({
        autoEnabled: true,
        primary: local,
        chain,
        runnable,
      }),
      "auto",
    );
    assert.equal(
      autoFallbackResponseModeForSend({
        autoEnabled: true,
        primary: openai,
        chain,
        runnable,
      }),
      "online",
    );
  });
});
