import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  COFFEE_GROUP_MAX_SIZE,
  COFFEE_GROUP_MIN_SIZE,
  buildRouterPrompt,
  createCoffeeConversation,
  normalizeCoffeeGroupBotIds,
  normalizeCoffeeSeatBotIds,
  parseRouterResponse,
  pickDirectedSpeaker,
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

describe("normalizeCoffeeSeatBotIds", () => {
  it("preserves fixed seat positions while validating occupied seats", () => {
    const result = normalizeCoffeeSeatBotIds([null, "bot-a", null, "bot-b", null]);
    assert.deepEqual(result, [null, "bot-a", null, "bot-b", null]);
  });
});

function createCoffeeTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      conversation_mode TEXT NOT NULL DEFAULT 'sandbox',
      bot_id TEXT,
      bot_group_ids TEXT,
      incognito INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      color TEXT,
      glyph TEXT,
      model TEXT,
      local_model TEXT,
      online_model TEXT,
      online_enabled INTEGER NOT NULL DEFAULT 1,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2048,
      visibility TEXT NOT NULL DEFAULT 'private',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function seedCoffeeBot(db: DatabaseSync, userId: string, bot: CoffeeBotProfile): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO bots (
      id, user_id, name, system_prompt, color, glyph, model, local_model,
      online_model, online_enabled, temperature, max_tokens, visibility,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'private', ?, ?)`
  ).run(
    bot.id,
    userId,
    bot.name,
    bot.systemPrompt,
    bot.color,
    bot.glyph,
    bot.defaultModel,
    bot.localModel,
    bot.onlineModel,
    bot.onlineEnabled ? 1 : 0,
    bot.temperature,
    bot.maxTokens,
    now,
    now
  );
}

describe("createCoffeeConversation", () => {
  it("creates an empty Coffee session with frozen bot group ids", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const result = createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });

    assert.equal(result.conversation.mode, "coffee");
    assert.equal(result.conversation.botId, null);
    assert.deepEqual(result.conversation.botGroupIds, [ALICE.id, BORIS.id]);
    assert.deepEqual(result.conversation.coffeeSeatBotIds, [
      ALICE.id,
      BORIS.id,
      null,
      null,
      null,
    ]);
    assert.equal(result.conversation.messages.length, 0);
    assert.match(result.conversation.title, /Coffee with Alice, Boris/);
    assert.match(result.arrivalScenario, /user-first|partial-table-in-progress|full-table-present/);
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

describe("pickDirectedSpeaker", () => {
  it("returns null when director mode has no requested bot", () => {
    assert.equal(pickDirectedSpeaker([ALICE, BORIS], undefined), null);
    assert.equal(pickDirectedSpeaker([ALICE, BORIS], null), null);
    assert.equal(pickDirectedSpeaker([ALICE, BORIS], "  "), null);
  });

  it("returns the requested seated bot", () => {
    const result = pickDirectedSpeaker([ALICE, BORIS], "bot-boris");
    assert.equal(result?.id, "bot-boris");
  });

  it("rejects a bot that is not seated at the table", () => {
    assert.throws(
      () => pickDirectedSpeaker([ALICE, BORIS], "bot-cara"),
      /not seated/
    );
  });
});
