import assert from "node:assert/strict";
import { test } from "node:test";
import { generatePrismInputRefractDraft } from "../prism-input-refract.ts";
import type { LlmProvider } from "../providers.ts";

function providerReturning(response: string): LlmProvider {
  return {
    name: "local",
    diagnosticModel: "test-model",
    async generateResponse() {
      return response;
    },
    async embedText() {
      return [];
    },
  };
}

test("generates a bounded draft-only contextual input candidate", async () => {
  const result = await generatePrismInputRefractDraft({
    target: {
      kind: "prism.input.text",
      surface: { surfaceId: "avatar-studio", botIds: ["bot-1"] },
      label: "Bot introduction",
      context: "Profile · public description",
      multiline: false,
      maxLength: 24,
    },
    currentValue: "Quiet machine",
    rejectedValues: ["Patient machine"],
    authoritativeContext: { surface: "avatar-studio", bot: "Lantern" },
    provider: providerReturning(
      '```json\n{"value":"  A warm machine with patient light  "}\n```',
    ),
    model: "test-model",
  });
  assert.equal(result.generated, true);
  assert.equal(result.value, "A warm machine with pati");
  assert.equal(result.provider, "local");
  assert.equal(result.model, "test-model");
});

test("rejects malformed or repeated contextual input candidates", async () => {
  const target = {
    kind: "prism.input.text" as const,
    surface: { surfaceId: "settings" as const },
    label: "Display name",
    context: "Account profile",
    multiline: false,
    maxLength: 80,
  };
  const malformed = await generatePrismInputRefractDraft({
    target,
    currentValue: "Jared",
    rejectedValues: [],
    authoritativeContext: {},
    provider: providerReturning("Jared"),
    model: "test-model",
  });
  assert.equal(malformed.generated, false);
  const repeated = await generatePrismInputRefractDraft({
    target,
    currentValue: "Jared",
    rejectedValues: [],
    authoritativeContext: {},
    provider: providerReturning('{"value":"jared"}'),
    model: "test-model",
  });
  assert.equal(repeated.generated, false);
});
