import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUILT_IN_PROMPT_WILDCARD_SLOTS,
  getBuiltInPromptWildcardSlot,
  normalizeBuiltInPromptWildcardSlotKey,
  parseStoredPromptShortcutPayload,
  parseStoredPromptWildcardPayload,
  parseStoredPsychicThoughtPayload,
  serializePromptShortcutPayload,
  serializePromptToolPayload,
  withPromptShortcutResolvedPrompt,
  withPromptWildcardResolvedPrompt,
} from "./promptShortcut.ts";

describe("built-in prompt wildcard slots", () => {
  it("normalizes labels, aliases, and brace tokens to canonical keys", () => {
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("ADJECTIVE"), "ADJECTIVE");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("adj"), "ADJECTIVE");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("{PLURAL NOUN}"), "PLURAL_NOUN");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("plural-noun"), "PLURAL_NOUN");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("{NUM}"), "NUM");
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("number"), "NUM");
  });

  it("rejects unsupported built-in wildcard keys", () => {
    assert.equal(normalizeBuiltInPromptWildcardSlotKey("MOOD RING"), null);
    assert.equal(getBuiltInPromptWildcardSlot("MOOD RING"), null);
  });

  it("keeps built-in wildcard keys unique", () => {
    const keys = new Set(BUILT_IN_PROMPT_WILDCARD_SLOTS.map((slot) => slot.key));
    assert.equal(keys.size, BUILT_IN_PROMPT_WILDCARD_SLOTS.length);
  });
});

describe("prompt shortcut payloads", () => {
  it("round-trips persisted prompt shortcut metadata", () => {
    const serialized = serializePromptShortcutPayload({
      v: 1,
      commandId: "builtin:/help",
      name: "help",
      invocation: "/help -v explain this",
      flags: [{ key: "v", value: "Please be verbose" }],
      passthrough: "explain this",
      resolvedPrompt: "Choose luminous garden.",
      wildcardReplacements: [
        { key: "ADJECTIVE", value: "luminous", start: 7, end: 15 },
        { key: "PLACE", value: "garden", start: 16, end: 22 },
      ],
    });

    assert.equal(typeof serialized, "string");
    assert.deepEqual(parseStoredPromptShortcutPayload(serialized), {
      v: 1,
      commandId: "builtin:/help",
      name: "help",
      invocation: "/help -v explain this",
      flags: [{ key: "v", value: "Please be verbose" }],
      passthrough: "explain this",
      resolvedPrompt: "Choose luminous garden.",
      wildcardReplacements: [
        { key: "ADJECTIVE", value: "luminous", start: 7, end: 15 },
        { key: "PLACE", value: "garden", start: 16, end: 22 },
      ],
    });
  });

  it("ignores invalid or unrelated payloads", () => {
    assert.equal(parseStoredPromptShortcutPayload(null), undefined);
    assert.equal(parseStoredPromptShortcutPayload("not json"), undefined);
    assert.equal(
      parseStoredPromptShortcutPayload(JSON.stringify({ v: 1, mood: { key: "warm" } })),
      undefined
    );
  });

  it("adds the concrete prompt sent to the model", () => {
    assert.deepEqual(
      withPromptShortcutResolvedPrompt(
        {
          v: 1,
          commandId: "custom:/blah",
          name: "blah",
          invocation: "/blah",
          flags: [],
          wildcardReplacements: [
            { key: "ADJECTIVE", value: "luminous", start: 36, end: 44 },
          ],
        },
        "Tell me a 5-paragraph story about a luminous garden."
      ),
      {
        v: 1,
        commandId: "custom:/blah",
        name: "blah",
        invocation: "/blah",
        flags: [],
        resolvedPrompt: "Tell me a 5-paragraph story about a luminous garden.",
        wildcardReplacements: [
          { key: "ADJECTIVE", value: "luminous", start: 36, end: 44 },
        ],
      }
    );
  });

  it("round-trips general wildcard run metadata alongside prompt shortcuts", () => {
    const serialized = serializePromptToolPayload({
      promptShortcut: {
        v: 1,
        commandId: "custom:/story",
        name: "story",
        invocation: "/story",
        flags: [],
      },
      promptWildcards: {
        v: 1,
        template: "Tell me about !randomShit with {ADJECTIVE}.",
        resolvedPrompt: "Tell me about lemon with luminous.",
        wildcardReplacements: [
          { key: "randomShit", value: "lemon", start: 14, end: 19 },
          { key: "ADJECTIVE", value: "luminous", start: 25, end: 33 },
        ],
      },
      psychicThought: {
        v: 1,
        summary: "I checked the moving parts before answering.",
        effort: "medium",
        provider: "local",
        model: "llama3.2",
        createdAt: "2026-06-22T12:00:00.000Z",
      },
    });

    assert.equal(typeof serialized, "string");
    assert.deepEqual(parseStoredPromptShortcutPayload(serialized), {
      v: 1,
      commandId: "custom:/story",
      name: "story",
      invocation: "/story",
      flags: [],
    });
    assert.deepEqual(parseStoredPromptWildcardPayload(serialized), {
      v: 1,
      template: "Tell me about !randomShit with {ADJECTIVE}.",
      resolvedPrompt: "Tell me about lemon with luminous.",
      wildcardReplacements: [
        { key: "RANDOMSHIT", value: "lemon", start: 14, end: 19 },
        { key: "ADJECTIVE", value: "luminous", start: 25, end: 33 },
      ],
    });
    assert.deepEqual(parseStoredPsychicThoughtPayload(serialized), {
      v: 1,
      summary: "I checked the moving parts before answering.",
      effort: "medium",
      provider: "local",
      model: "llama3.2",
      createdAt: "2026-06-22T12:00:00.000Z",
    });
  });

  it("adds the concrete prompt sent to wildcard metadata", () => {
    assert.deepEqual(
      withPromptWildcardResolvedPrompt(
        {
          v: 1,
          template: "Tell me about !randomShit.",
          wildcardReplacements: [{ key: "RANDOMSHIT", value: "potato", start: 14, end: 20 }],
        },
        "Tell me about potato."
      ),
      {
        v: 1,
        template: "Tell me about !randomShit.",
        resolvedPrompt: "Tell me about potato.",
        wildcardReplacements: [{ key: "RANDOMSHIT", value: "potato", start: 14, end: 20 }],
      }
    );
  });
});
