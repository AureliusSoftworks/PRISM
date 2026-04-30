import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseHiddenBotModelIds,
  resolveNextSettings,
  sanitizeOpenAiKeyInput,
  type CurrentSettings,
} from "../settings.ts";

/**
 * These tests pin the PATCH /api/settings semantics. They exist because the
 * server has regressed twice on "obvious" fields:
 *   - `theme === "system"` was silently rejected, making the cycle button
 *     feel broken even though the frontend was doing the right thing.
 *   - `providerLocked` wasn't persisted, so the padlock felt random.
 * If a future change drops any of these cases, node --test will shout.
 */

function baseline(overrides: Partial<CurrentSettings> = {}): CurrentSettings {
  return {
    theme: "dark",
    preferredProvider: "local",
    providerLocked: 0,
    autoMemory: 1,
    hiddenBotModelIds: "[]",
    ...overrides,
  };
}

describe("resolveNextSettings — theme", () => {
  it("accepts 'light'", () => {
    const next = resolveNextSettings({ theme: "light" }, baseline());
    assert.equal(next.theme, "light");
  });

  it("accepts 'dark'", () => {
    const next = resolveNextSettings({ theme: "dark" }, baseline({ theme: "light" }));
    assert.equal(next.theme, "dark");
  });

  it("accepts 'system' (this is the previously-regressed case)", () => {
    const next = resolveNextSettings({ theme: "system" }, baseline({ theme: "dark" }));
    assert.equal(next.theme, "system");
  });

  it("keeps the stored theme when the field is missing", () => {
    const next = resolveNextSettings({}, baseline({ theme: "system" }));
    assert.equal(next.theme, "system");
  });

  it("keeps the stored theme when the value is garbage", () => {
    const next = resolveNextSettings({ theme: "purple" }, baseline({ theme: "light" }));
    assert.equal(next.theme, "light");
  });
});

describe("resolveNextSettings — preferredProvider", () => {
  it("accepts 'local' and 'openai'", () => {
    assert.equal(
      resolveNextSettings({ preferredProvider: "local" }, baseline()).preferredProvider,
      "local"
    );
    assert.equal(
      resolveNextSettings({ preferredProvider: "openai" }, baseline()).preferredProvider,
      "openai"
    );
  });

  it("keeps the stored provider when the field is missing or invalid", () => {
    const current = baseline({ preferredProvider: "openai" });
    assert.equal(resolveNextSettings({}, current).preferredProvider, "openai");
    assert.equal(
      resolveNextSettings({ preferredProvider: "anthropic" }, current).preferredProvider,
      "openai"
    );
  });
});

describe("resolveNextSettings — providerLocked", () => {
  it("persists true as 1", () => {
    const next = resolveNextSettings({ providerLocked: true }, baseline());
    assert.equal(next.providerLocked, 1);
  });

  it("persists false as 0", () => {
    const next = resolveNextSettings(
      { providerLocked: false },
      baseline({ providerLocked: 1 })
    );
    assert.equal(next.providerLocked, 0);
  });

  it("keeps the stored lock when the field is missing", () => {
    const next = resolveNextSettings({}, baseline({ providerLocked: 1 }));
    assert.equal(next.providerLocked, 1);
  });

  it("ignores non-boolean values rather than coercing them", () => {
    // If a future client accidentally sends "true"/"false" strings, we want
    // the server to keep the existing value rather than silently flipping.
    const next = resolveNextSettings(
      { providerLocked: "true" as unknown as boolean },
      baseline({ providerLocked: 0 })
    );
    assert.equal(next.providerLocked, 0);
  });
});

describe("resolveNextSettings — autoMemory", () => {
  it("persists boolean values", () => {
    assert.equal(
      resolveNextSettings({ autoMemory: false }, baseline({ autoMemory: 1 })).autoMemory,
      0
    );
    assert.equal(
      resolveNextSettings({ autoMemory: true }, baseline({ autoMemory: 0 })).autoMemory,
      1
    );
  });

  it("keeps the stored value when the field is missing", () => {
    assert.equal(resolveNextSettings({}, baseline({ autoMemory: 1 })).autoMemory, 1);
  });
});

describe("resolveNextSettings — hiddenBotModelIds", () => {
  it("accepts a unique trimmed string list", () => {
    const next = resolveNextSettings(
      { hiddenBotModelIds: [" llama3.2 ", "llava", "llava", 42] },
      baseline()
    );
    assert.deepEqual(next.hiddenBotModelIds, ["llama3.2", "llava"]);
  });

  it("keeps the stored list when the field is missing or invalid", () => {
    const current = baseline({
      hiddenBotModelIds: JSON.stringify(["gpt-3.5-turbo"]),
    });
    assert.deepEqual(
      resolveNextSettings({}, current).hiddenBotModelIds,
      ["gpt-3.5-turbo"]
    );
    assert.deepEqual(
      resolveNextSettings({ hiddenBotModelIds: "nope" }, current).hiddenBotModelIds,
      ["gpt-3.5-turbo"]
    );
  });
});

describe("parseHiddenBotModelIds", () => {
  it("falls back to an empty list for malformed stored JSON", () => {
    assert.deepEqual(parseHiddenBotModelIds("not-json"), []);
  });
});

describe("resolveNextSettings — openAiApiKey", () => {
  it("non-empty string is a replace", () => {
    const next = resolveNextSettings({ openAiApiKey: "sk-abc" }, baseline());
    assert.deepEqual(next.openAiKeyIntent, { action: "replace", plaintext: "sk-abc" });
  });

  it("whitespace trims, and an all-whitespace value is treated as 'keep'", () => {
    const next = resolveNextSettings({ openAiApiKey: "   " }, baseline());
    assert.deepEqual(next.openAiKeyIntent, { action: "keep" });
  });

  it("explicit null is a clear", () => {
    const next = resolveNextSettings({ openAiApiKey: null }, baseline());
    assert.deepEqual(next.openAiKeyIntent, { action: "clear" });
  });

  it("missing field is 'keep' so other PATCHes don't wipe the stored key", () => {
    const next = resolveNextSettings({}, baseline());
    assert.deepEqual(next.openAiKeyIntent, { action: "keep" });
  });

  it("strips a pasted `OPENAI_API_KEY=` prefix (the real-world foot-gun)", () => {
    // Users often copy the whole `.env` line and paste it into the Settings
    // input. Without sanitization, the saved Bearer token would be
    // `OPENAI_API_KEY=sk-...` and every chat call would 401.
    const next = resolveNextSettings(
      { openAiApiKey: "OPENAI_API_KEY=sk-proj-abc" },
      baseline()
    );
    assert.deepEqual(next.openAiKeyIntent, {
      action: "replace",
      plaintext: "sk-proj-abc",
    });
  });

  it("strips surrounding double quotes", () => {
    const next = resolveNextSettings(
      { openAiApiKey: '"sk-proj-abc"' },
      baseline()
    );
    assert.deepEqual(next.openAiKeyIntent, {
      action: "replace",
      plaintext: "sk-proj-abc",
    });
  });

  it("strips VAR= prefix + inner quotes in one pass", () => {
    const next = resolveNextSettings(
      { openAiApiKey: 'OPENAI_API_KEY="sk-proj-abc"' },
      baseline()
    );
    assert.deepEqual(next.openAiKeyIntent, {
      action: "replace",
      plaintext: "sk-proj-abc",
    });
  });
});

describe("sanitizeOpenAiKeyInput", () => {
  it("pass-through for a clean key", () => {
    assert.equal(sanitizeOpenAiKeyInput("sk-proj-abc123"), "sk-proj-abc123");
  });

  it("trims outer whitespace", () => {
    assert.equal(sanitizeOpenAiKeyInput("   sk-proj-abc  "), "sk-proj-abc");
  });

  it("strips a leading VAR= prefix (uppercase)", () => {
    assert.equal(
      sanitizeOpenAiKeyInput("OPENAI_API_KEY=sk-proj-abc"),
      "sk-proj-abc"
    );
  });

  it("strips a leading var= prefix (lowercase, case-insensitive)", () => {
    assert.equal(
      sanitizeOpenAiKeyInput("api_key=sk-proj-abc"),
      "sk-proj-abc"
    );
  });

  it("strips surrounding single quotes", () => {
    assert.equal(sanitizeOpenAiKeyInput("'sk-proj-abc'"), "sk-proj-abc");
  });

  it("strips both the VAR= prefix AND inner quotes", () => {
    assert.equal(
      sanitizeOpenAiKeyInput('OPENAI_API_KEY="sk-proj-abc"'),
      "sk-proj-abc"
    );
  });

  it("strips outer quotes first, then VAR= prefix", () => {
    assert.equal(
      sanitizeOpenAiKeyInput('"OPENAI_API_KEY=sk-proj-abc"'),
      "sk-proj-abc"
    );
  });

  it("does NOT touch a key with a dash before the first =", () => {
    // Guard against accidentally chopping a real key. Real OpenAI keys
    // start with `sk-` which contains a dash, so the VAR= regex can't
    // match them even case-insensitively.
    assert.equal(
      sanitizeOpenAiKeyInput("sk-proj-Ab12=something"),
      "sk-proj-Ab12=something"
    );
  });

  it("does NOT strip a mismatched quote pair", () => {
    assert.equal(sanitizeOpenAiKeyInput("\"sk-proj-abc"), "\"sk-proj-abc");
    assert.equal(sanitizeOpenAiKeyInput("sk-proj-abc'"), "sk-proj-abc'");
  });

  it("returns empty string for all-whitespace / pure quotes", () => {
    assert.equal(sanitizeOpenAiKeyInput("   "), "");
    assert.equal(sanitizeOpenAiKeyInput('""'), "");
  });
});

describe("resolveNextSettings — independence", () => {
  // A partial PATCH must never clobber unrelated fields. This is the property
  // that makes the settings UI feel reliable.
  it("a lone `theme` patch doesn't touch anything else", () => {
    const current = baseline({
      theme: "dark",
      preferredProvider: "openai",
      providerLocked: 1,
      autoMemory: 0,
    });
    const next = resolveNextSettings({ theme: "system" }, current);
    assert.equal(next.theme, "system");
    assert.equal(next.preferredProvider, "openai");
    assert.equal(next.providerLocked, 1);
    assert.equal(next.autoMemory, 0);
    assert.deepEqual(next.openAiKeyIntent, { action: "keep" });
  });

  it("a lone `providerLocked` patch doesn't touch anything else", () => {
    const current = baseline({
      theme: "system",
      preferredProvider: "openai",
      providerLocked: 0,
      autoMemory: 1,
    });
    const next = resolveNextSettings({ providerLocked: true }, current);
    assert.equal(next.theme, "system");
    assert.equal(next.preferredProvider, "openai");
    assert.equal(next.providerLocked, 1);
    assert.equal(next.autoMemory, 1);
    assert.deepEqual(next.openAiKeyIntent, { action: "keep" });
  });
});
