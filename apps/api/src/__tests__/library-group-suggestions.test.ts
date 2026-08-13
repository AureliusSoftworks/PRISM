import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  inferLibraryGroupSuggestions,
  parseLibraryGroupSuggestionIds,
} from "../library-group-suggestions.ts";
import type { LlmProvider, ProviderMessage } from "../providers.ts";

test("group suggestions accept only unique IDs supplied by the server", () => {
  assert.deepEqual(
    parseLibraryGroupSuggestionIds(
      '{"groupIds":["group:one","not-a-group","group:one","group:two","group:three","group:four"]}',
      new Set(["group:one", "group:two", "group:three", "group:four"]),
    ),
    ["group:one", "group:two", "group:three"],
  );
  assert.deepEqual(
    parseLibraryGroupSuggestionIds("this is not JSON", new Set(["group:one"])),
    [],
  );
});

test("group suggestion prompts are bounded and helper failures remain visible", async () => {
  let received: ProviderMessage[] = [];
  const provider: LlmProvider = {
    name: "local",
    async generateResponse(messages) {
      received = messages;
      return '{"groupIds":["group:one"]}';
    },
    async embedText() {
      return [];
    },
  };
  const result = await inferLibraryGroupSuggestions({
    provider,
    bot: { name: "n".repeat(400), purpose: "p".repeat(1_000) },
    candidates: [{
      id: "group:one",
      name: "G".repeat(200),
      description: "d".repeat(700),
      memberNames: Array.from({ length: 9 }, () => "m".repeat(120)),
    }],
    signal: new AbortController().signal,
  });
  assert.deepEqual(result, ["group:one"]);
  assert.equal(received.length, 2);
  const payload = JSON.parse(received[1]?.content ?? "{}") as {
    bot: { name: string; purpose: string };
    candidates: Array<{ name: string; description: string; members: string[] }>;
  };
  assert.equal(payload.bot.name.length, 120);
  assert.equal(payload.bot.purpose.length, 600);
  assert.equal(payload.candidates[0]?.name.length, 120);
  assert.equal(payload.candidates[0]?.description.length, 420);
  assert.equal(payload.candidates[0]?.members.length, 6);
  assert.equal(payload.candidates[0]?.members[0]?.length, 80);

  const unavailable: LlmProvider = {
    name: "local",
    async generateResponse() {
      throw new Error("Ollama is unavailable");
    },
    async embedText() {
      return [];
    },
  };
  await assert.rejects(
    inferLibraryGroupSuggestions({
      provider: unavailable,
      bot: { name: "Bot", purpose: "Purpose" },
      candidates: [{ id: "group:one", name: "One", description: "", memberNames: [] }],
      signal: new AbortController().signal,
    }),
    /Ollama is unavailable/u,
  );
});

test("the POST endpoint is auxiliary-local only and exposes local failures", () => {
  const source = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  const start = source.indexOf('route("POST", "/api/library/groups/suggestions"');
  const end = source.indexOf('route("GET", "/api/prism/capabilities"', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const endpoint = source.slice(start, end);
  assert.match(endpoint, /auxiliaryProviderFactoryOverride/u);
  assert.doesNotMatch(endpoint, /providerFactoryOverride/u);
  assert.match(endpoint, /AbortController/u);
  assert.match(endpoint, /LIBRARY_GROUP_SUGGESTION_TIMEOUT_MS/u);
  assert.match(endpoint, /runWithUsageSession/u);
  assert.match(endpoint, /unavailable:\s*true/u);
  assert.match(endpoint, /stripBotProfileMetaSuffix/u);
});
