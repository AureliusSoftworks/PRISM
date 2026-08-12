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
    providerName: "local",
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
    providerName: "local",
    model: "test-model",
  });
  assert.equal(malformed.generated, false);
  const repeated = await generatePrismInputRefractDraft({
    target,
    currentValue: "Jared",
    rejectedValues: [],
    authoritativeContext: {},
    provider: providerReturning('{"value":"jared"}'),
    providerName: "local",
    model: "test-model",
  });
  assert.equal(repeated.generated, false);
});

test("keeps the focused unsaved bot draft ahead of stale saved identity", async () => {
  let capturedPrompt = "";
  const provider = providerReturning('{"value":"Measures claims against the stars."}');
  provider.generateResponse = async (messages) => {
    capturedPrompt = messages.map((message) => message.content).join("\n");
    return '{"value":"Measures claims against the stars."}';
  };

  await generatePrismInputRefractDraft({
    target: {
      kind: "prism.input.text",
      surface: { surfaceId: "avatar-studio", botIds: ["bot-1"] },
      label: "Eratosthenes Power",
      context:
        "Focused Avatar Studio bot draft identity: Eratosthenes. Current draft personality and profile: Ancient Greek mathematician and geographer.",
      multiline: true,
      maxLength: 400,
    },
    currentValue: "",
    rejectedValues: [],
    authoritativeContext: {
      surfaceId: "avatar-studio",
      bots: [{ id: "bot-1", name: "Stale saved identity" }],
    },
    provider,
    providerName: "local",
    model: "test-model",
  });

  assert.match(
    capturedPrompt,
    /treat that draft identity and profile as current/u,
  );
  assert.match(capturedPrompt, /Focused Avatar Studio bot draft identity: Eratosthenes/u);
  assert.match(capturedPrompt, /Stale saved identity/u);
});

test("uses a nonblank current field value as the semantic seed", async () => {
  let capturedPrompt = "";
  const provider = providerReturning(
    '{"value":"Anything he drops into a bucket becomes urgently conspicuous."}',
  );
  provider.generateResponse = async (messages) => {
    capturedPrompt = messages.map((message) => message.content).join("\n");
    return '{"value":"Anything he drops into a bucket becomes urgently conspicuous."}';
  };

  await generatePrismInputRefractDraft({
    target: {
      kind: "prism.input.text",
      surface: { surfaceId: "avatar-studio", botIds: ["bot-1"] },
      label: "Eratosthenes Power",
      context: "Focused Avatar Studio bot draft identity: Eratosthenes.",
      multiline: true,
      maxLength: 400,
    },
    currentValue: "  Poops in a bucket  ",
    rejectedValues: [],
    authoritativeContext: { surfaceId: "avatar-studio" },
    provider,
    providerName: "local",
    model: "test-model",
  });

  assert.match(
    capturedPrompt,
    /current field value is the primary semantic seed/u,
  );
  assert.match(
    capturedPrompt,
    /Preserve its recognizable subject and intent/u,
  );
  assert.match(
    capturedPrompt,
    /Do not ignore it or pivot to an unrelated idea/u,
  );
  assert.match(
    capturedPrompt,
    /Current field value: "Poops in a bucket"/u,
  );
});

test("keeps context-only generation when the input field is blank", async () => {
  let capturedPrompt = "";
  const provider = providerReturning(
    '{"value":"Profile draft with clear, grounded intent."}',
  );
  provider.generateResponse = async (messages) => {
    capturedPrompt = messages.map((message) => message.content).join("\n");
    return '{"value":"Profile draft with clear, grounded intent."}';
  };

  await generatePrismInputRefractDraft({
    target: {
      kind: "prism.input.text",
      surface: { surfaceId: "avatar-studio", botIds: ["bot-1"] },
      label: "Avatar prompt",
      context: "Profile · character focus",
      multiline: true,
      maxLength: 400,
    },
    currentValue: "",
    rejectedValues: [],
    authoritativeContext: { surfaceId: "avatar-studio" },
    provider,
    providerName: "local",
    model: "test-model",
  });

  assert.match(
    capturedPrompt,
    /current field is blank/u,
  );
  assert.match(
    capturedPrompt,
    /Generate the candidate from the field label, visible field context, and authoritative PRISM context/u,
  );
  assert.match(capturedPrompt, /Current field value: None/u);
  assert.doesNotMatch(capturedPrompt, /primary semantic seed/u);
});

test("forwards the resolved foreground model, effort, and Turbo state", async () => {
  let capturedOptions: Parameters<LlmProvider["generateResponse"]>[1];
  const provider = providerReturning('{"value":"A sharper public purpose."}');
  provider.generateResponse = async (_messages, options) => {
    capturedOptions = options;
    return '{"value":"A sharper public purpose."}';
  };

  const result = await generatePrismInputRefractDraft({
    target: {
      kind: "prism.input.text",
      surface: { surfaceId: "avatar-studio", botIds: ["bot-1"] },
      label: "Purpose",
      context: "Profile",
      multiline: true,
      maxLength: 400,
    },
    currentValue: "",
    rejectedValues: [],
    authoritativeContext: {},
    provider,
    providerName: "openai",
    model: "gpt-5.6-terra",
    reasoningEffort: "high",
    turbo: true,
  });

  assert.equal(result.provider, "openai");
  assert.equal(result.model, "gpt-5.6-terra");
  assert.equal(capturedOptions?.model, "gpt-5.6-terra");
  assert.equal(capturedOptions?.reasoningEffort, "high");
  assert.equal(capturedOptions?.turbo, true);
});
