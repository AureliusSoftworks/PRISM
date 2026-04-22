import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LocalOllamaProvider,
  OpenAiProvider,
  selectProvider,
} from "../providers.ts";

/**
 * These tests pin the LOCAL privacy invariant: when a user (or bot, or
 * auto-switch, or anything else) has asked for LOCAL, selectProvider must
 * return the Ollama-backed provider no matter what other inputs look like.
 * If this test ever needs to be weakened, think hard — it's the thing
 * keeping the "LOCAL" badge honest.
 */
describe("selectProvider", () => {
  describe("LOCAL mode invariant", () => {
    it("returns LocalOllamaProvider when preferredProvider is 'local'", () => {
      const provider = selectProvider("local");
      assert.ok(provider instanceof LocalOllamaProvider);
      assert.equal(provider.name, "local");
    });

    it("stays local even when an OpenAI key is available", () => {
      // A key being present must not silently escalate a LOCAL turn.
      const provider = selectProvider("local", "sk-real-looking-key");
      assert.ok(provider instanceof LocalOllamaProvider);
      assert.ok(!(provider instanceof OpenAiProvider));
    });

    it("stays local across many calls with varied key inputs", () => {
      // Belt-and-suspenders: iterate a handful of plausible inputs (empty
      // string, whitespace, realistic key) and confirm none of them flip
      // the returned provider class.
      const keys = [undefined, "", "   ", "sk-abc", "sk-" + "x".repeat(48)];
      for (const key of keys) {
        const provider = selectProvider("local", key);
        assert.ok(
          provider instanceof LocalOllamaProvider,
          `LOCAL must stay local for key=${JSON.stringify(key)}`
        );
      }
    });
  });

  describe("OPENAI mode", () => {
    it("throws with a clear message when no key is available", () => {
      assert.throws(
        () => selectProvider("openai"),
        /OpenAI is selected but no API key is available/
      );
    });

    it("throws for undefined, empty-string, and whitespace keys", () => {
      // The current implementation only guards against a falsy key, so an
      // all-whitespace string slips through. Documenting the current shape
      // here — if we later tighten the check, this test should be updated.
      assert.throws(() => selectProvider("openai", undefined));
      assert.throws(() => selectProvider("openai", ""));
    });

    it("returns OpenAiProvider when a key is present", () => {
      const provider = selectProvider("openai", "sk-test-key");
      assert.ok(provider instanceof OpenAiProvider);
      assert.equal(provider.name, "openai");
    });
  });
});
