import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COFFEE_GROUP_MAX_SIZE,
  COFFEE_GROUP_MIN_SIZE,
  buildRouterPrompt,
  normalizeCoffeeGroupBotIds,
  parseRouterResponse,
  pickFallbackSpeaker,
  type CoffeeBotProfile,
} from "../coffee.ts";

/**
 * Coffee mode is the multi-bot turn-taking primitive that downstream
 * modes (Arena, Polling, Feed) build on. These tests pin the small,
 * pure helpers that decide WHICH bot speaks each turn — the part the
 * design discussion locked as "reactive routing via an LLM moderator
 * with a graceful round-robin fallback when the moderator misfires."
 */

const ALICE: CoffeeBotProfile = {
  id: "bot-alice",
  name: "Alice",
  systemPrompt: "Curious philosopher who loves Socratic questions.",
  color: "#ff6699",
  glyph: "leaf",
  localModel: null,
  onlineModel: null,
  defaultModel: null,
  temperature: 0.7,
  maxTokens: 512,
  onlineEnabled: true,
};

const BORIS: CoffeeBotProfile = {
  id: "bot-boris",
  name: "Boris",
  systemPrompt: "Grumpy chef who makes everything about food.",
  color: "#33aa55",
  glyph: "spark",
  localModel: null,
  onlineModel: null,
  defaultModel: null,
  temperature: 0.7,
  maxTokens: 512,
  onlineEnabled: true,
};

const CARA: CoffeeBotProfile = {
  id: "bot-cara",
  name: "Cara",
  systemPrompt: "Pragmatic engineer who plans things in lists.",
  color: "#3377ff",
  glyph: "spark",
  localModel: null,
  onlineModel: null,
  defaultModel: null,
  temperature: 0.7,
  maxTokens: 512,
  onlineEnabled: true,
};

describe("normalizeCoffeeGroupBotIds", () => {
  it("accepts a 2-bot group and preserves caller order", () => {
    const result = normalizeCoffeeGroupBotIds(["bot-a", "bot-b"]);
    assert.deepEqual(result, ["bot-a", "bot-b"]);
  });

  it("dedupes repeated ids before length-checking", () => {
    const result = normalizeCoffeeGroupBotIds(["bot-a", "bot-a", "bot-b", "bot-c"]);
    assert.deepEqual(result, ["bot-a", "bot-b", "bot-c"]);
  });

  it("rejects groups smaller than the minimum size", () => {
    assert.throws(
      () => normalizeCoffeeGroupBotIds(["bot-a"]),
      /Pick at least .* bots/
    );
    assert.throws(
      () => normalizeCoffeeGroupBotIds([]),
      new RegExp(`at least ${COFFEE_GROUP_MIN_SIZE}`)
    );
  });

  it("rejects groups larger than the maximum size", () => {
    const tooMany = Array.from({ length: COFFEE_GROUP_MAX_SIZE + 1 }, (_, i) => `bot-${i}`);
    assert.throws(() => normalizeCoffeeGroupBotIds(tooMany), /max out at/);
  });

  it("ignores non-string entries instead of including them", () => {
    const result = normalizeCoffeeGroupBotIds(["bot-a", 42, null, "bot-b"]);
    assert.deepEqual(result, ["bot-a", "bot-b"]);
  });

  it("throws when the input is not an array", () => {
    assert.throws(() => normalizeCoffeeGroupBotIds("bot-a" as unknown), /Coffee groups need/);
    assert.throws(() => normalizeCoffeeGroupBotIds(undefined), /Coffee groups need/);
  });
});

describe("buildRouterPrompt", () => {
  it("includes every bot id and persona snippet in the system message", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What should I make for dinner?",
      lastSpeakerBotId: null,
    });
    assert.ok(messages.length >= 2, "expected at least a system + user message");
    const system = messages[0];
    assert.equal(system?.role, "system");
    assert.match(system!.content, /id="bot-alice"/);
    assert.match(system!.content, /id="bot-boris"/);
    assert.match(system!.content, /id="bot-cara"/);
    assert.match(system!.content, /name="Alice"/);
    assert.match(system!.content, /Curious philosopher/);
  });

  it("notes the previous speaker and asks for variety when one exists", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Pick a topic.",
      lastSpeakerBotId: "bot-alice",
    });
    const system = messages[0];
    assert.match(system!.content, /last bot to speak was id="bot-alice"/);
    assert.match(system!.content, /Prefer variety/);
  });

  it("indicates a fresh thread when no one has spoken yet", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Hello.",
      lastSpeakerBotId: null,
    });
    assert.match(messages[0]!.content, /No bot has spoken yet/);
  });
});

describe("parseRouterResponse", () => {
  const allowed = ["bot-alice", "bot-boris", "bot-cara"];

  it("parses a clean JSON object response", () => {
    const result = parseRouterResponse(
      `{"botId": "bot-boris", "reason": "talking about food"}`,
      allowed
    );
    assert.deepEqual(result, { botId: "bot-boris", reason: "talking about food" });
  });

  it("recovers JSON wrapped in code-fence-style chatter", () => {
    const result = parseRouterResponse(
      "```json\n{\"botId\": \"bot-cara\", \"reason\": \"engineering question\"}\n```",
      allowed
    );
    assert.equal(result?.botId, "bot-cara");
    assert.equal(result?.reason, "engineering question");
  });

  it("rejects bot ids that are not in the allowed group", () => {
    const result = parseRouterResponse(
      `{"botId": "bot-stranger", "reason": "irrelevant"}`,
      allowed
    );
    assert.equal(result, null);
  });

  it("returns null for malformed responses without throwing", () => {
    assert.equal(parseRouterResponse("not even close to json", allowed), null);
    assert.equal(parseRouterResponse("", allowed), null);
    assert.equal(parseRouterResponse("{ broken json", allowed), null);
  });

  it("supplies a default reason when the LLM omits one", () => {
    const result = parseRouterResponse(
      `{"botId": "bot-alice"}`,
      allowed
    );
    assert.equal(result?.botId, "bot-alice");
    assert.match(result?.reason ?? "", /no reason/i);
  });
});

describe("pickFallbackSpeaker", () => {
  it("returns the first bot when no one has spoken yet", () => {
    const result = pickFallbackSpeaker([ALICE, BORIS, CARA], null);
    assert.equal(result.id, "bot-alice");
  });

  it("rotates to the next bot in caller order after a known speaker", () => {
    const after = pickFallbackSpeaker([ALICE, BORIS, CARA], "bot-alice");
    assert.equal(after.id, "bot-boris");
    const wrap = pickFallbackSpeaker([ALICE, BORIS, CARA], "bot-cara");
    assert.equal(wrap.id, "bot-alice");
  });

  it("falls back to the first bot when the prior speaker is no longer in the group", () => {
    const result = pickFallbackSpeaker([ALICE, BORIS], "bot-removed");
    assert.equal(result.id, "bot-alice");
  });

  it("throws if the group is empty (programmer error guard)", () => {
    assert.throws(() => pickFallbackSpeaker([], null), /Coffee group is empty/);
  });
});
