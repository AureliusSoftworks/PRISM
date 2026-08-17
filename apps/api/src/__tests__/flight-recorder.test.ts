import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");

describe("Flight Recorder summary route", () => {
  it("accepts only strict trace lines and stays on the configured local auxiliary model", () => {
    const route = serverSource.match(
      /route\("POST", "\/api\/flight-recorder\/summary"[\s\S]*?route\("POST", "\/api\/prism-companion"/u,
    )?.[0] ?? "";
    assert.match(route, /const userId = requireAuth\(ctx\)/u);
    assert.match(route, /safeEvents = trace[\s\S]*?\.filter\(\(line\)/u);
    assert.match(route, /getAuxiliaryProvider\(user\.prism_default_llm_model/u);
    assert.match(route, /experimentalDualOllama: user\.experimental_dual_ollama_enabled === 1/u);
    assert.match(route, /Never claim access to prompts, messages, memories, credentials, audio, or hidden reasoning/u);
    assert.doesNotMatch(route, /selectProvider\(/u);
    assert.doesNotMatch(route, /getOpenAiApiKeyForUser/u);
  });
});
