import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GenerateOptions, LlmProvider, ProviderMessage } from "../providers.ts";
import {
  applyPromptWildcardValues,
  promptWildcardNames,
  resolvePromptWildcardsWithModel,
} from "../prompt-wildcards.ts";

describe("prompt wildcard resolution", () => {
  it("tracks repeated wildcard slots as independent occurrences", async () => {
    let requestedPrompt = "";
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(messages: ProviderMessage[], _options?: GenerateOptions) {
        requestedPrompt = messages.at(-1)?.content ?? "";
        return JSON.stringify({
          NUM__1: "12",
          ADJECTIVE__1: "feral",
          NUM__2: "43",
          ADJECTIVE__2: "sleepy",
        });
      },
      async embedText() {
        return [];
      },
    };

    const result = await resolvePromptWildcardsWithModel({
      prompt: "Would you rather fight {NUM} {ADJECTIVE} nuns, or {NUM} {ADJECTIVE} undertakers?",
      provider,
      generationOverrides: {},
    });

    assert.match(requestedPrompt, /NUM__1/u);
    assert.match(requestedPrompt, /NUM__2/u);
    assert.match(requestedPrompt, /ADJECTIVE__1/u);
    assert.match(requestedPrompt, /ADJECTIVE__2/u);
    assert.equal(
      result.prompt,
      "Would you rather fight 12 feral nuns, or 43 sleepy undertakers?"
    );
    assert.deepEqual(
      result.replacements.map(({ key, value, start, end }) => ({ key, value, start, end })),
      [
        { key: "NUM", value: "12", start: 23, end: 25 },
        { key: "ADJECTIVE", value: "feral", start: 26, end: 31 },
        { key: "NUM", value: "43", start: 41, end: 43 },
        { key: "ADJECTIVE", value: "sleepy", start: 44, end: 50 },
      ]
    );
  });

  it("preserves resolved deck replacements around true wildcard slots", () => {
    const result = applyPromptWildcardValues(
      "Pick lemon with {ADJECTIVE}.",
      new Map([["ADJECTIVE__1", "bright"]]),
      [{ key: "FOOD", value: "lemon", start: 5, end: 10 }]
    );

    assert.deepEqual(result, {
      prompt: "Pick lemon with bright.",
      replacements: [
        { key: "FOOD", value: "lemon", start: 5, end: 10 },
        { key: "ADJECTIVE", value: "bright", start: 16, end: 22 },
      ],
    });
  });

  it("reports repeated wildcard names so callers still detect a wildcard run", () => {
    assert.deepEqual(promptWildcardNames("{NUM} {NUM} {ADJECTIVE}"), [
      "NUM",
      "NUM",
      "ADJECTIVE",
    ]);
  });
});
