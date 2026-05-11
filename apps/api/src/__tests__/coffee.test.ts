import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  COFFEE_GROUP_MAX_SIZE,
  COFFEE_GROUP_MIN_SIZE,
  buildCoffeeTableTuningAppendix,
  buildRouterPrompt,
  buildSpeakerPrompt,
  clampCoffeeSocialValue,
  clampCoffeeTableReplyText,
  computePlayerInterruptionConsequences,
  computeNextCoffeeSocialState,
  createCoffeeConversation,
  updateCoffeeConversationSettings,
  initializeCoffeeSocialState,
  maybeBuildBotInterruptionEvent,
  normalizeCoffeeGroupBotIds,
  normalizeCoffeeSeatBotIds,
  parseRouterResponse,
  pickDirectedSpeaker,
  pickFallbackSpeaker,
  stripCoffeeSpeakerPrefix,
  type CoffeeBotProfile,
} from "../coffee.ts";
import {
  coffeeReplyLengthCaps,
  coffeeRouterTemperature,
  DEFAULT_COFFEE_SESSION_SETTINGS,
  normalizeCoffeeSessionSettings,
} from "@localai/shared";

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

const TEST_SOCIAL = {
  disposition: 0.5,
  valuesFriction: 0.25,
  restraint: 0.72,
  engagement: 0.62,
  leavePressure: 0.18,
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
      coffee_settings TEXT,
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
    CREATE TABLE coffee_bot_social_state (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      disposition REAL NOT NULL,
      values_friction REAL NOT NULL,
      restraint REAL NOT NULL,
      engagement REAL NOT NULL,
      leave_pressure REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, conversation_id, bot_id)
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
    assert.deepEqual(result.conversation.coffeeBotSocialById, {
      [ALICE.id]: {
        disposition: 0.5,
        valuesFriction: 0.35,
        restraint: 0.65,
        engagement: 0.65,
        leavePressure: 0.1,
      },
      [BORIS.id]: {
        disposition: 0.5,
        valuesFriction: 0.35,
        restraint: 0.65,
        engagement: 0.65,
        leavePressure: 0.1,
      },
    });
    assert.equal(result.conversation.messages.length, 0);
    assert.match(result.conversation.title, /Coffee with Alice, Boris/);
    assert.match(result.arrivalScenario, /user-first|partial-table-in-progress|full-table-present/);
    const persistedRows = db
      .prepare(
        "SELECT bot_id, disposition, values_friction, restraint, engagement, leave_pressure FROM coffee_bot_social_state WHERE conversation_id = ? ORDER BY bot_id"
      )
      .all(result.conversation.id) as Array<{ bot_id: string; leave_pressure: number }>;
    assert.equal(persistedRows.length, 2);
    assert.deepEqual(
      persistedRows.map((row) => row.bot_id),
      [ALICE.id, BORIS.id].sort()
    );
    assert.ok(persistedRows.every((row) => row.leave_pressure >= 0 && row.leave_pressure <= 1));
  });

  it("persists normalized coffee settings and returns them on the conversation", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const result = createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      coffeeSettings: {
        responseLength: "brief",
        crossTalk: "chatty",
        responseDelayBias: 999,
        breathingRoom: -5,
      },
    });

    assert.equal(result.conversation.coffeeSettings?.responseLength, "brief");
    assert.equal(result.conversation.coffeeSettings?.crossTalk, "chatty");
    assert.equal(result.conversation.coffeeSettings?.responseDelayBias, 100);

    const row = db
      .prepare("SELECT coffee_settings FROM conversations WHERE id = ?")
      .get(result.conversation.id) as { coffee_settings: string };
    const parsed = JSON.parse(row.coffee_settings) as { responseLength: string };
    assert.equal(parsed.responseLength, "brief");

    const merged = updateCoffeeConversationSettings(db, userId, result.conversation.id, {
      responseLength: "roomy",
    });
    assert.equal(merged.responseLength, "roomy");
    assert.equal(merged.crossTalk, "chatty");
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
    assert.match(messages[0]!.content, /still warming up/);
    assert.match(messages[0]!.content, /should not imply prior friendship/);
  });

  it("allows topic changes without forcing every bot to answer", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Alice just said: The rain feels soft today.",
      lastSpeakerBotId: ALICE.id,
      turnKind: "autonomous",
    });
    assert.match(messages[0]!.content, /gently change topics/);
    assert.match(messages[0]!.content, /Do not force every bot to answer everything/);
  });

  it("formats prior bot messages as a clean transcript instead of bracketed assistant labels", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [
        {
          id: "msg-1",
          role: "assistant",
          content: "[Alice (assistant)] What a curious question.",
          botName: "Alice",
          createdAt: new Date().toISOString(),
        },
      ],
      userMessage: "Continue.",
      lastSpeakerBotId: ALICE.id,
    });

    const transcript = messages.find((message) =>
      message.content.includes("Recent table transcript")
    );
    assert.ok(transcript);
    assert.match(transcript!.content, /Alice: What a curious question\./);
    assert.doesNotMatch(transcript!.content, /\[Alice \(assistant\)\]/);
  });

  it("frames autonomous turns as table moments, not fresh user utterances", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Alice just said: What do you think, Boris?",
      lastSpeakerBotId: ALICE.id,
      turnKind: "autonomous",
    });

    const focus = messages.find((message) =>
      message.content.includes("Current autonomous table moment")
    );
    assert.equal(focus?.role, "system");
    assert.match(focus!.content, /Alice just said/);
  });

  it("welcomes bot-to-bot banter when cross-talk is chatty", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Hi.",
      lastSpeakerBotId: ALICE.id,
      sessionSettings: normalizeCoffeeSessionSettings({ crossTalk: "chatty" }),
    });
    assert.match(messages[0]!.content, /Bot-to-bot banter is welcome/i);
    assert.match(messages[0]!.content, /riffing is welcome/i);
  });
});

describe("buildSpeakerPrompt", () => {
  it("includes one-clause and 48-char tabletop guidance", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
    });
    const systemInstruction = messages.find(
      (message) =>
        message.role === "system" &&
        message.content.includes("Coffee Mode") &&
        message.content.includes("48 characters")
    );
    assert.ok(systemInstruction);
    assert.match(systemInstruction!.content, /no line breaks/);
    assert.match(systemInstruction!.content, /ONE clause only/);
    assert.match(systemInstruction!.content, /No second sentence/);
    assert.match(systemInstruction!.content, /Do not end with a question by default/);
    assert.match(systemInstruction!.content, /cutting off another bot mid-sentence/);
    assert.match(systemInstruction!.content, /still warming up/);
    assert.match(systemInstruction!.content, /Hard tabletop cap/);
    assert.match(systemInstruction!.content, /excitedly/);

    const userTurnInstruction = messages.at(-1);
    assert.equal(userTurnInstruction?.role, "user");
    assert.match(userTurnInstruction!.content, /48 characters/);
    assert.match(userTurnInstruction!.content, /Do not end with a question unless/);
  });

  it("uses roomy caps when session responseLength is roomy", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
      sessionSettings: normalizeCoffeeSessionSettings({ responseLength: "roomy" }),
    });
    const combined = messages.map((m) => m.content).join("\n");
    assert.match(combined, /96 characters/);
    assert.doesNotMatch(combined, /48 characters/);
  });
});

describe("clampCoffeeTableReplyText", () => {
  it("returns short text untouched", () => {
    assert.equal(clampCoffeeTableReplyText("  Hello there. "), "Hello there.");
  });

  it("collapses internal whitespace into single spaces", () => {
    assert.equal(clampCoffeeTableReplyText("A\n\nB\tC"), "A B C");
  });

  it("truncates oversized replies", () => {
    const filler = `${"word ".repeat(120)}`;
    const out = clampCoffeeTableReplyText(filler, 48);
    assert.ok(out.endsWith("…") || out.length <= 48);
    assert.ok(out.length < filler.length);
  });

  it("respects a custom max character budget", () => {
    const long = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    const out = clampCoffeeTableReplyText(long, 28);
    assert.ok(out.length <= 28);
  });

  it("prefers cutting at sentence punctuation when possible", () => {
    const base = `${"short ".repeat(2)}`; // keep \"First fitting end.\" inside the 48-char window
    const tail = `${"reallylongtoken".repeat(12)}`;
    const long = `${base}First fitting end. ${tail}`;
    const out = clampCoffeeTableReplyText(long);
    assert.ok(out.includes("First fitting end."), out);
    assert.ok(out.length <= 48);
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

  it("accepts a unique bot name when the router returns name-shaped JSON", () => {
    const result = parseRouterResponse(
      `{"botName": "Boris", "reason": "Boris was addressed directly"}`,
      [ALICE, BORIS, CARA]
    );
    assert.deepEqual(result, {
      botId: "bot-boris",
      reason: "Boris was addressed directly",
    });
  });
});

describe("stripCoffeeSpeakerPrefix", () => {
  it("removes copied bracket speaker labels from visible replies", () => {
    assert.equal(
      stripCoffeeSpeakerPrefix("[Mister Rogers (assistant)] I really appreciate that.", "Mister Rogers"),
      "I really appreciate that."
    );
  });

  it("removes copied colon speaker labels from visible replies", () => {
    assert.equal(
      stripCoffeeSpeakerPrefix("Bob Ross: Let's add a little color.", "Bob Ross"),
      "Let's add a little color."
    );
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

describe("coffee social state helpers", () => {
  it("clamps social values to the 0-1 range", () => {
    assert.equal(clampCoffeeSocialValue(-0.25), 0);
    assert.equal(clampCoffeeSocialValue(1.25), 1);
    assert.equal(clampCoffeeSocialValue(0.42), 0.42);
  });

  it("initializes missing bot snapshots from defaults", () => {
    const state = initializeCoffeeSocialState([ALICE, BORIS], {
      [ALICE.id]: {
        disposition: 0.75,
        valuesFriction: 0.1,
        restraint: 0.45,
        engagement: 0.8,
        leavePressure: 0.2,
      },
    });
    assert.deepEqual(state[ALICE.id], {
      disposition: 0.75,
      valuesFriction: 0.1,
      restraint: 0.45,
      engagement: 0.8,
      leavePressure: 0.2,
    });
    assert.deepEqual(state[BORIS.id], {
      disposition: 0.5,
      valuesFriction: 0.35,
      restraint: 0.65,
      engagement: 0.65,
      leavePressure: 0.1,
    });
  });

  it("updates speaker and non-speakers deterministically", () => {
    const previous = initializeCoffeeSocialState([ALICE, BORIS], {});
    const next = computeNextCoffeeSocialState({
      previousByBotId: previous,
      group: [ALICE, BORIS],
      speakerBotId: BORIS.id,
      turnKind: "user",
      replyText: "I would rather not go there. Let's move on.",
    });
    assert.ok(next[BORIS.id]!.valuesFriction > previous[BORIS.id]!.valuesFriction);
    assert.ok(next[BORIS.id]!.restraint > previous[BORIS.id]!.restraint);
    assert.ok(next[BORIS.id]!.engagement > previous[BORIS.id]!.engagement);
    assert.ok(next[ALICE.id]!.engagement < previous[ALICE.id]!.engagement);
  });

  it("injects social guardrail context into speaker prompts", () => {
    const prompts = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: {
          disposition: 0.4,
          valuesFriction: 0.8,
          restraint: 0.85,
          engagement: 0.5,
          leavePressure: 0.4,
        },
        [BORIS.id]: {
          disposition: 0.6,
          valuesFriction: 0.2,
          restraint: 0.5,
          engagement: 0.7,
          leavePressure: 0.1,
        },
      },
    });
    const combined = prompts.map((prompt) => prompt.content).join("\n");
    assert.match(combined, /Hidden social metrics for this moment/i);
    assert.match(combined, /Avoid insults or hostile escalation/i);
  });
});

describe("computePlayerInterruptionConsequences", () => {
  it("applies stronger deltas to interrupted bot and light third-party friction", () => {
    const socialByBotId = {
      [ALICE.id]: {
        disposition: 0.58,
        valuesFriction: 0.3,
        restraint: 0.78,
        engagement: 0.7,
        leavePressure: 0.12,
      },
      [BORIS.id]: {
        disposition: 0.46,
        valuesFriction: 0.52,
        restraint: 0.4,
        engagement: 0.63,
        leavePressure: 0.2,
      },
      [CARA.id]: {
        disposition: 0.6,
        valuesFriction: 0.2,
        restraint: 0.8,
        engagement: 0.6,
        leavePressure: 0.15,
      },
    };

    const consequences = computePlayerInterruptionConsequences({
      interruptedBotId: BORIS.id,
      visibleTokenCount: 12,
      group: [ALICE, BORIS, CARA],
      socialByBotId,
    });

    assert.equal(consequences.length, 3);
    const interrupted = consequences.find((entry) => entry.botId === BORIS.id);
    assert.ok(interrupted);
    assert.ok((interrupted?.dispositionDelta ?? 0) < 0);
    assert.ok((interrupted?.valuesFrictionDelta ?? 0) > 0);
    const others = consequences.filter((entry) => entry.botId !== BORIS.id);
    assert.ok(others.every((entry) => entry.valuesFrictionDelta >= 0));
  });
});

describe("maybeBuildBotInterruptionEvent", () => {
  const socialByBotId = {
    [ALICE.id]: {
      disposition: 0.5,
      valuesFriction: 0.25,
      restraint: 0.72,
      engagement: 0.66,
      leavePressure: 0.2,
    },
    [BORIS.id]: {
      disposition: 0.39,
      valuesFriction: 0.9,
      restraint: 0.08,
      engagement: 0.98,
      leavePressure: 0.22,
    },
  };

  it("returns undefined when autonomous-compose gate is not satisfied", () => {
    const noCompose = maybeBuildBotInterruptionEvent({
      turnKind: "autonomous",
      userIsComposing: false,
      speaker: BORIS,
      socialByBotId,
      group: [ALICE, BORIS],
      conversationId: "coffee-gate",
      historyLength: 4,
    });
    assert.equal(noCompose, undefined);

    const wrongTurnKind = maybeBuildBotInterruptionEvent({
      turnKind: "user",
      userIsComposing: true,
      speaker: BORIS,
      socialByBotId,
      group: [ALICE, BORIS],
      conversationId: "coffee-gate",
      historyLength: 4,
    });
    assert.equal(wrongTurnKind, undefined);
  });

  it("emits bounded interruption metadata for at least one deterministic seed", () => {
    let event: ReturnType<typeof maybeBuildBotInterruptionEvent> | undefined;
    for (let attempt = 0; attempt < 180 && !event; attempt += 1) {
      event = maybeBuildBotInterruptionEvent({
        turnKind: "autonomous",
        userIsComposing: true,
        speaker: BORIS,
        socialByBotId,
        group: [ALICE, BORIS],
        conversationId: `coffee-interrupt-${attempt}`,
        historyLength: 12,
      });
    }
    assert.ok(event, "expected at least one seed to produce a rare interruption");
    assert.equal(event?.kind, "botInterruptsPlayer");
    assert.equal(event?.interrupterBotId, BORIS.id);
    assert.ok((event?.socialConsequences.length ?? 0) >= 1);
  });
});

describe("normalizeCoffeeSessionSettings", () => {
  it("returns defaults for non-objects and ignores invalid enums", () => {
    assert.deepEqual(
      normalizeCoffeeSessionSettings(undefined),
      { ...DEFAULT_COFFEE_SESSION_SETTINGS }
    );
    assert.deepEqual(
      normalizeCoffeeSessionSettings({ responseLength: "huge", crossTalk: "loud" }),
      { ...DEFAULT_COFFEE_SESSION_SETTINGS }
    );
  });

  it("clamps numeric sliders and preserves known enum values", () => {
    const s = normalizeCoffeeSessionSettings({
      responseLength: "detailed",
      responseDelayBias: -20,
      breathingRoom: 200,
      stayOnThread: false,
    });
    assert.equal(s.responseLength, "detailed");
    assert.equal(s.responseDelayBias, 0);
    assert.equal(s.breathingRoom, 100);
    assert.equal(s.stayOnThread, false);
  });
});

describe("coffeeReplyLengthCaps", () => {
  it("maps presets to bounded caps", () => {
    const brief = coffeeReplyLengthCaps(normalizeCoffeeSessionSettings({ responseLength: "brief" }));
    assert.deepEqual(brief, { tableReplyMaxChars: 28, speakerMaxOutputTokens: 16 });
    const roomy = coffeeReplyLengthCaps(normalizeCoffeeSessionSettings({ responseLength: "roomy" }));
    assert.deepEqual(roomy, { tableReplyMaxChars: 96, speakerMaxOutputTokens: 60 });
  });
});

describe("coffeeRouterTemperature", () => {
  it("stays within a modest band for extreme delay bias", () => {
    const cold = coffeeRouterTemperature(normalizeCoffeeSessionSettings({ responseDelayBias: 0 }));
    const hot = coffeeRouterTemperature(normalizeCoffeeSessionSettings({ responseDelayBias: 100 }));
    assert.ok(cold >= 0.05 && cold <= 0.45);
    assert.ok(hot >= 0.05 && hot <= 0.45);
    assert.ok(hot > cold);
  });
});

describe("buildCoffeeTableTuningAppendix", () => {
  it("reflects cross-talk and stay-on-thread modes", () => {
    const rare = buildCoffeeTableTuningAppendix(
      normalizeCoffeeSessionSettings({ crossTalk: "rare", stayOnThread: false })
    );
    assert.match(rare, /one clear voice at a time/i);
    assert.match(rare, /Topic shifts are allowed/i);

    const chatty = buildCoffeeTableTuningAppendix(
      normalizeCoffeeSessionSettings({ crossTalk: "chatty", stayOnThread: true })
    );
    assert.match(chatty, /riffing is welcome/i);
    assert.match(chatty, /Discourage hard topic jumps/i);
  });
});
