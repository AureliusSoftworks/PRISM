import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseStoredPromptShortcutPayload,
  serializePromptShortcutPayload,
  withPromptShortcutResolvedPrompt,
} from "./promptShortcut.ts";

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
});
