import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeTextModelDisplayNames,
  parseStoredTextModelDisplayNames,
  resolveTextModelDisplayName,
  textModelDisplayNameKey,
} from "./modelDisplayNames.ts";

describe("text model display names", () => {
  it("normalizes bounded account-local aliases without changing routing keys", () => {
    const names = normalizeTextModelDisplayNames({
      "openai:gpt-5-mini": "  Fast   Writer ",
      "anthropic:claude-sonnet-4-6": "Deep Thinker",
      "unknown:model": "Ignored",
      "local:": "Ignored",
      "openai:gpt-4o": "x".repeat(81),
    });
    assert.deepEqual(names, {
      "openai:gpt-5-mini": "Fast Writer",
      "anthropic:claude-sonnet-4-6": "Deep Thinker",
    });
    assert.equal(
      textModelDisplayNameKey("openai", "gpt-5-mini"),
      "openai:gpt-5-mini",
    );
  });

  it("falls back for missing, cleared, malformed, or disallowed aliases", () => {
    assert.deepEqual(parseStoredTextModelDisplayNames("not json"), {});
    assert.equal(
      resolveTextModelDisplayName({
        displayNames: { "local:qwen3": "Workshop" },
        provider: "local",
        modelId: "qwen3",
        fallback: "Qwen 3",
      }),
      "Workshop",
    );
    assert.equal(
      resolveTextModelDisplayName({
        displayNames: {},
        provider: "local",
        modelId: "qwen3",
        fallback: "Qwen 3",
      }),
      "Qwen 3",
    );
  });
});
